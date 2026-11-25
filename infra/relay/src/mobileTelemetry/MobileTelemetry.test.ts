import * as NodeHttpPlatform from "@effect/platform-node/NodeHttpPlatform";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { RelayApi } from "@t3tools/contracts/relay";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Etag from "effect/http/Etag";
import * as HttpEffect from "effect/http/HttpEffect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import { RELAY_HTTP_ROUTER_CONFIG } from "../http/Api.ts";
import * as RelayHttpApi from "../http/Api.ts";
import * as MobileTelemetry from "./MobileTelemetry.ts";

const PROJECT_ID = "d763fcb8-d37c-41ea-a773-b54a0ab4a454";
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** Maps generated column 12 of the one-line bundle to `src/App.tsx` 1:2. */
const SOURCE_MAP = encodeJson({ version: 3, sources: ["src/App.tsx"], mappings: "AAAA,UAAE" });

const httpEffect = HttpRouter.toHttpEffect(
  Layer.mergeAll(
    HttpApiBuilder.layer(HttpApi.make("RelayApi").add(RelayApi.groups.mobileTelemetry)).pipe(
      Layer.provide(MobileTelemetry.layerApi.pipe(Layer.provide(MobileTelemetry.layer))),
      Layer.provide([NodeServices.layer, NodeHttpPlatform.layer, Etag.layerWeak]),
    ),
    RelayHttpApi.layerNotFoundRoute,
  ),
).pipe(Effect.provideService(HttpRouter.RouterConfig, RELAY_HTTP_ROUTER_CONFIG));

describe("MobileTelemetry", () => {
  it.effect("returns success to legacy clients without reading any report body", () =>
    Effect.gen(function* () {
      const handler = yield* httpEffect;
      let bodyReads = 0;
      for (const signal of ["metrics", "traces", "logs"] as const) {
        const body = new ReadableStream<Uint8Array>(
          {
            pull: (controller) => {
              bodyReads += 1;
              controller.close();
            },
          },
          { highWaterMark: 0 },
        );
        const init = { method: "POST", body, duplex: "half" } as const;
        const request = new Request(
          `https://relay.test/v1/mobile/observe/${PROJECT_ID}/v1/${signal}`,
          init,
        );
        const response = yield* Deferred.make<HttpServerResponse.HttpServerResponse>();
        yield* HttpEffect.toHandled(handler, (_request, value) =>
          Deferred.succeed(response, value),
        ).pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(request),
          ),
        );
        expect((yield* Deferred.await(response)).status).toBe(204);
      }
      expect(bodyReads).toBe(0);
    }),
  );

  it.effect("decodes one source map at a time", () =>
    Effect.gen(function* () {
      const releaseFirst = yield* Deferred.make<void>();
      const firstStarted = yield* Deferred.make<void>();
      let firstDone = false;
      let secondSawFirstDone: boolean | undefined;
      const sourceMaps = yield* MobileTelemetry.SourceMaps.pipe(
        Effect.provide(MobileTelemetry.layerSourceMaps),
        Effect.provideService(MobileTelemetry.SourceMapObjects, {
          get: (key) =>
            key === "first"
              ? Deferred.succeed(firstStarted, undefined).pipe(
                  Effect.andThen(Deferred.await(releaseFirst)),
                  Effect.as({ size: SOURCE_MAP.length, text: Effect.succeed(SOURCE_MAP) }),
                  Effect.ensuring(Effect.sync(() => (firstDone = true))),
                )
              : Effect.sync(() => {
                  secondSawFirstDone = firstDone;
                  return { size: SOURCE_MAP.length, text: Effect.succeed(SOURCE_MAP) };
                }),
        }),
      );
      const first = yield* Effect.forkChild(sourceMaps.find("first"));
      yield* Deferred.await(firstStarted);
      const second = yield* Effect.forkChild(sourceMaps.find("second"), { startImmediately: true });
      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Fiber.join(first);
      expect(yield* Fiber.join(second)).toMatchObject({ key: "second" });
      expect(secondSawFirstDone).toBe(true);
    }),
  );
});
