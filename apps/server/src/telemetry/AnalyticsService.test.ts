import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as AnalyticsService from "./AnalyticsService.ts";

it.effect("discards events without an analytics client or installation identity", () =>
  Effect.gen(function* () {
    const analytics = yield* AnalyticsService.AnalyticsService;

    assert.isFalse(yield* analytics.record("server.boot.heartbeat", { projectCount: 1 }));
    assert.isFalse(yield* analytics.record("agent.feedback", { kind: "bug" }, { anonymous: true }));
    yield* analytics.recordOwners([{ source: "connect", ownerId: "a".repeat(64) }], "client");
    yield* analytics.flush;
  }).pipe(Effect.provide(AnalyticsService.layer)),
);
