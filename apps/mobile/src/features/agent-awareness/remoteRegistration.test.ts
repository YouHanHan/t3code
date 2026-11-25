/// <reference types="node" />

import { afterEach, beforeEach, vi } from "vite-plus/test";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { ManagedRelay } from "@t3tools/client-runtime/relay";

import {
  refreshActiveLiveActivityRemoteRegistration,
  releaseAgentAwarenessRelayTokenProvider,
  setAgentAwarenessRelayTokenProvider,
} from "./remoteRegistration";

const mocks = vi.hoisted(() => ({
  runInBackground: vi.fn(),
  publishWidget: vi.fn(() => Promise.resolve()),
  removeListener: vi.fn(),
}));

vi.mock("../../lib/runtime", () => ({
  runtime: { runPromiseExit: mocks.runInBackground },
}));
vi.mock("../../persistence/imperative", () => ({
  clearAgentAwarenessRegistrationRecord: vi.fn(() => Promise.resolve()),
}));
vi.mock("expo-secure-store", () => ({}));
vi.mock("./androidNotifications", () => ({
  clearAndroidAgentNotifications: vi.fn(),
}));
vi.mock("./agentLiveActivity", () => ({
  dismissEndedAgentLiveActivities: vi.fn(),
  getAgentLiveActivities: () => [],
}));
vi.mock("../../widgets/publishAgentActivityWidget", () => ({
  publishAgentActivityWidget: mocks.publishWidget,
}));
vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: mocks.removeListener }) },
  Platform: { OS: "ios" },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { relay: { url: "https://relay.example.test" } } } },
}));

const unsupportedRequest = () => Effect.die("Unexpected relay request");
const relayLayer = (
  getAgentActivitySnapshot: ManagedRelay.ManagedRelayClient["Service"]["getAgentActivitySnapshot"],
) =>
  Layer.succeed(
    ManagedRelay.ManagedRelayClient,
    ManagedRelay.ManagedRelayClient.of({
      relayUrl: "https://relay.example.test",
      listEnvironments: unsupportedRequest,
      listDevices: unsupportedRequest,
      getT3ChatLink: unsupportedRequest,
      createT3ChatLinkRequest: unsupportedRequest,
      unlinkT3Chat: unsupportedRequest,
      createEnvironmentLinkChallenge: unsupportedRequest,
      linkEnvironment: unsupportedRequest,
      unlinkEnvironment: unsupportedRequest,
      getEnvironmentStatus: unsupportedRequest,
      connectEnvironment: unsupportedRequest,
      registerDevice: unsupportedRequest,
      unregisterDevice: unsupportedRequest,
      registerLiveActivity: unsupportedRequest,
      getAgentActivitySnapshot,
      resetTokenCache: Effect.void,
    }),
  );

beforeEach(() => {
  mocks.runInBackground.mockReset();
  mocks.runInBackground.mockResolvedValue(Exit.void);
  mocks.publishWidget.mockClear();
});

afterEach(() => releaseAgentAwarenessRelayTokenProvider());

it.effect("schedules only a widget read when the account signs in", () =>
  Effect.gen(function* () {
    const read = vi.fn(() => Effect.succeed({ aggregate: null }));
    setAgentAwarenessRelayTokenProvider(() => Promise.resolve("clerk-token"), "user-a");
    expect(mocks.runInBackground).toHaveBeenCalledTimes(1);
    const [operation] = mocks.runInBackground.mock.calls[0] as [
      Effect.Effect<void, never, ManagedRelay.ManagedRelayClient>,
    ];
    yield* operation.pipe(Effect.provide(relayLayer(read)));
    expect(read).toHaveBeenCalledWith({ clerkToken: "clerk-token" });
    expect(mocks.publishWidget).toHaveBeenLastCalledWith({ kind: "snapshot", aggregate: null });
  }),
);

it.effect("discards a widget read that completes after the account changes", () =>
  Effect.gen(function* () {
    const firstRequested = yield* Deferred.make<void>();
    const releaseFirst = yield* Deferred.make<void>();
    const relay = relayLayer(({ clerkToken }) =>
      clerkToken === "old-token"
        ? Deferred.succeed(firstRequested, undefined).pipe(
            Effect.andThen(Deferred.await(releaseFirst)),
            Effect.as({ aggregate: null }),
          )
        : Effect.succeed({ aggregate: null }),
    );
    setAgentAwarenessRelayTokenProvider(() => Promise.resolve("old-token"), "user-a");
    const first = yield* Effect.forkChild(
      refreshActiveLiveActivityRemoteRegistration().pipe(Effect.provide(relay)),
    );
    yield* Deferred.await(firstRequested);
    setAgentAwarenessRelayTokenProvider(() => Promise.resolve("new-token"), "user-b");
    yield* refreshActiveLiveActivityRemoteRegistration().pipe(Effect.provide(relay));
    mocks.publishWidget.mockClear();
    yield* Deferred.succeed(releaseFirst, undefined);
    yield* Fiber.join(first);
    expect(mocks.publishWidget).not.toHaveBeenCalled();
  }),
);
