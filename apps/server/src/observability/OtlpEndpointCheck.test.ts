import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as OtlpEndpointCheck from "./OtlpEndpointCheck.ts";

it.effect("returns unavailable for legacy endpoint checks without an HTTP client", () =>
  Effect.gen(function* () {
    const checker = yield* OtlpEndpointCheck.OtlpEndpointCheck;
    for (const signal of ["traces", "metrics", "logs"] as const) {
      const result = yield* checker.check({
        signal,
        url: `https://collector.invalid/v1/${signal}`,
      });
      assert.deepEqual(result, { _tag: "Unreachable", timedOut: false });
    }
  }).pipe(Effect.provide(OtlpEndpointCheck.layer)),
);
