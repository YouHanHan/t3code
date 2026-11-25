import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { withRelayClientTracing } from "@t3tools/shared/relayTracing";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
// Load the runtime's module graph once at collection, outside the per-test timeout;
// each case re-evaluates it from that cache after vi.resetModules().
import "./runtime";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("web runtime relay tracing", () => {
  it.each([
    {
      surface: "desktop",
      desktopBridge: { getRelayTelemetryEnabled: () => true },
    },
    {
      surface: "self-hosted browser",
      desktopBridge: undefined,
    },
    {
      // The hosted app is served by no T3 server, so nothing can answer for it.
      surface: "hosted app",
      desktopBridge: undefined,
      location: new URL("https://app.example.test/"),
    },
  ])("keeps relay spans local in $surface", async (surface) => {
    vi.resetModules();
    vi.stubEnv("VITE_RELAY_OTLP_TRACES_URL", "https://telemetry.example.test/v1/traces");
    vi.stubEnv("VITE_RELAY_OTLP_TRACES_DATASET", "relay-test");
    vi.stubEnv("VITE_RELAY_OTLP_TRACES_TOKEN", "test-token");
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://app.example.test");
    vi.stubGlobal("window", {
      desktopBridge: surface.desktopBridge,
      location: "location" in surface ? surface.location : undefined,
    });
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchFn);
    const { runtime: freshRuntime } = await import("./runtime");
    const { setDelegate } = await import("../observability/clientTracer");
    const spans: Array<string> = [];

    try {
      setDelegate(
        Tracer.make({
          span(options) {
            spans.push(options.name);
            return new Tracer.NativeSpan(options);
          },
        }),
      );
      expect(
        await freshRuntime.runPromise(
          Effect.succeed("relay operation completed").pipe(
            Effect.withSpan("relay.first-operation"),
            withRelayClientTracing,
          ),
        ),
      ).toBe("relay operation completed");

      await freshRuntime.runPromise(Effect.void.pipe(Effect.withSpan("user.work")));
      expect(spans).toContain("relay.first-operation");
      expect(spans).toContain("user.work");
    } finally {
      setDelegate(null);
      await freshRuntime.dispose();
    }

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
