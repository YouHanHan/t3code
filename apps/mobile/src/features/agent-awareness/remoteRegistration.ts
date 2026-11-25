import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AppState, Platform } from "react-native";
import { findErrorTraceId } from "@t3tools/client-runtime/errors";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import {
  isAtomCommandInterrupted,
  settleAsyncResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { runtime } from "../../lib/runtime";
import * as MobileStorage from "../../persistence/mobile-storage";
import { clearAgentAwarenessRegistrationRecord } from "../../persistence/imperative";
import type { AgentActivityWidgetSource } from "../../widgets/agentActivityWidgetTimeline";
import { publishAgentActivityWidget } from "../../widgets/publishAgentActivityWidget";
import { dismissEndedAgentLiveActivities, getAgentLiveActivities } from "./agentLiveActivity";
import { clearAndroidAgentNotifications } from "./androidNotifications";
import { resolveCloudPublicConfig } from "../cloud/publicConfig";

const AgentAwarenessOperation = Schema.Literals([
  "read-device-unregistration-relay-token",
  "load-device-unregistration-identifier",
]);

export class AgentAwarenessOperationError extends Schema.TaggedError<AgentAwarenessOperationError>()(
  "AgentAwarenessOperationError",
  {
    operation: AgentAwarenessOperation,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Agent awareness operation ${this.operation} failed.`;
  }
}

export type AgentAwarenessRegistrationError =
  | AgentAwarenessOperationError
  | ManagedRelay.ManagedRelayClientError;

export type AgentAwarenessRegistrationServices =
  | ManagedRelay.ManagedRelayClient
  | MobileStorage.MobileStorage;

export const getAgentAwarenessRegistrationStatus = ():
  | "unknown"
  | "pending"
  | "registered"
  | "failed" => "unknown";
export const agentAwarenessNotificationsReady = () => false;
export const subscribeAgentAwarenessRegistrationStatus = () => () => {};
export const refreshAgentAwarenessRegistration = () => Effect.void;
export const updateAgentAwarenessRegistrationPreferences = (_preferences: {
  readonly liveActivitiesEnabled?: boolean;
}) => Effect.void;

// Refreshes can overlap (sign-in, foreground, retry); only the newest read may
// repaint, so a slow older response never overwrites newer rows.
let widgetSnapshotReads = 0;
let relayTokenProvider: (() => Promise<string | null>) | null = null;
let relayTokenProviderIdentity: string | null = null;
let appStateSubscription: { remove: () => void } | null = null;

function readRelayConfig(): { readonly url: string } | null {
  const url = resolveCloudPublicConfig().relay.url;
  return url ? { url } : null;
}

function canRegisterRemoteLiveActivities(): boolean {
  return Platform.OS === "ios";
}

const unregisterDeviceWithRelay = Effect.fn("remoteRegistration.unregisterDeviceWithRelay")(
  function* (input: {
    readonly deviceId: string;
    readonly tokenProvider: () => Promise<string | null>;
  }): Effect.fn.Return<void, AgentAwarenessRegistrationError, ManagedRelay.ManagedRelayClient> {
    if (!readRelayConfig()) return;
    const token = yield* Effect.tryPromise({
      try: input.tokenProvider,
      catch: (cause) =>
        new AgentAwarenessOperationError({
          operation: "read-device-unregistration-relay-token",
          cause,
        }),
    });
    if (!token) {
      return;
    }

    const client = yield* ManagedRelay.ManagedRelayClient;
    yield* client.unregisterDevice({
      clerkToken: token,
      deviceId: input.deviceId,
    });
  },
);

function logRegistrationError(context: string, error: unknown): void {
  if (!__DEV__) {
    return;
  }
  console.warn(`[agent-awareness] ${context}`, {
    message: error instanceof Error ? error.message : String(error),
    traceId: findErrorTraceId(error),
    error,
  });
}

function runRegistrationInBackground<E>(
  operation: Effect.Effect<unknown, E, AgentAwarenessRegistrationServices>,
  context: string,
): void {
  void (async () => {
    const result = await settleAsyncResult(() => runtime.runPromiseExit(operation));
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      logRegistrationError(context, squashAtomCommandFailure(result));
    }
  })();
}

function publishWidget(source: AgentActivityWidgetSource): void {
  if (!canRegisterRemoteLiveActivities()) {
    return;
  }
  publishAgentActivityWidget(source).catch((error: unknown) => {
    logRegistrationError("agent activity widget publish failed", error);
  });
}

// Binaries built before the native dismissEnded method throw here.
function dismissEndedLocalLiveActivities(): void {
  try {
    dismissEndedAgentLiveActivities();
  } catch (error) {
    logRegistrationError("ended live activity cleanup failed", error);
  }
}

function endLocalLiveActivities(context: string): void {
  if (!canRegisterRemoteLiveActivities()) {
    return;
  }
  dismissEndedLocalLiveActivities();
  try {
    for (const activity of getAgentLiveActivities()) {
      activity.end("immediate").catch((error: unknown) => {
        logRegistrationError(context, error);
      });
    }
  } catch (error) {
    logRegistrationError(context, error);
  }
}

export const unregisterAgentAwarenessDeviceForCurrentUser: (
  tokenProvider: () => Promise<string | null>,
) => Effect.Effect<void, never, AgentAwarenessRegistrationServices> = Effect.fn(
  "remoteRegistration.unregisterAgentAwarenessDeviceForCurrentUser",
)(
  function* (tokenProvider: () => Promise<string | null>) {
    const storage = yield* MobileStorage.MobileStorage;
    const deviceId = yield* storage.loadAgentAwarenessDeviceId.pipe(
      Effect.mapError(
        (cause) =>
          new AgentAwarenessOperationError({
            operation: "load-device-unregistration-identifier",
            cause,
          }),
      ),
    );
    if (!deviceId) {
      return;
    }
    yield* unregisterDeviceWithRelay({ deviceId, tokenProvider });
  },
  Effect.catch((error) =>
    Effect.sync(() => {
      logRegistrationError("device unregistration failed", error);
    }),
  ),
);

export function setAgentAwarenessRelayTokenProvider(
  provider: (() => Promise<string | null>) | null,
  identity?: string,
): void {
  if (relayTokenProviderIdentity !== (identity ?? null)) {
    widgetSnapshotReads++;
    clearAndroidAgentNotifications();
    if (provider) publishWidget({ kind: "loading" });
  }
  relayTokenProvider = provider;
  relayTokenProviderIdentity = provider ? (identity ?? null) : null;

  if (!provider) {
    widgetSnapshotReads++;
    clearAndroidAgentNotifications();
    appStateSubscription?.remove();
    appStateSubscription = null;
    // Signed-out activities would be orphaned because the relay can no longer update or end them.
    endLocalLiveActivities("live activity cleanup after cloud sign-out failed");
    publishWidget({ kind: "signed-out" });
    void clearAgentAwarenessRegistrationRecord().catch((error: unknown) => {
      logRegistrationError("clear registration record on sign-out failed", error);
    });
    return;
  }
  if (!canRegisterRemoteLiveActivities()) return;
  appStateSubscription ??= AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    runRegistrationInBackground(
      refreshActiveLiveActivityRemoteRegistration(),
      "agent activity widget read after app foreground failed",
    );
  });
  runRegistrationInBackground(
    refreshActiveLiveActivityRemoteRegistration(),
    "agent activity widget read after cloud sign-in failed",
  );
}

// Provider remounts retain a valid relay registration; teardown must preserve it and lock-screen activities.
export function releaseAgentAwarenessRelayTokenProvider(): void {
  widgetSnapshotReads++;
  relayTokenProvider = null;
  relayTokenProviderIdentity = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
}

export const refreshActiveLiveActivityRemoteRegistration = Effect.fn(
  "remoteRegistration.refreshActiveLiveActivityRemoteRegistration",
)(function* () {
  const provider = relayTokenProvider;
  if (!canRegisterRemoteLiveActivities() || !provider || !readRelayConfig()) return;
  const read = ++widgetSnapshotReads;
  dismissEndedLocalLiveActivities();
  const snapshot = yield* Effect.gen(function* () {
    const token = yield* Effect.promise(provider);
    if (!token || read !== widgetSnapshotReads) return null;
    const client = yield* ManagedRelay.ManagedRelayClient;
    return yield* client.getAgentActivitySnapshot({ clerkToken: token });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logRegistrationError("agent activity snapshot read failed", cause);
        return null;
      }),
    ),
  );
  if (read !== widgetSnapshotReads) return;
  publishWidget(
    snapshot ? { kind: "snapshot", aggregate: snapshot.aggregate } : { kind: "unavailable" },
  );
});
