import { expect, it } from "vite-plus/test";
import * as AgentAwarenessRelay from "./AgentAwarenessRelay.ts";

it("does not expose the retired agent activity publisher", () => {
  expect(Object.keys(AgentAwarenessRelay)).toEqual([]);
});
