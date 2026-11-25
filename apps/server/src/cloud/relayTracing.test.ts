import { assert, it } from "@effect/vitest";

import { allowed } from "./relayTracing.ts";

it("disables relay tracing in existing clients", () => {
  assert.isFalse(allowed);
});
