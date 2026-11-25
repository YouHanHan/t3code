import type { EnvironmentCloudLinkStateResult } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cloudChangeReplacesLink } from "./t3ConnectState";

function linkState(input: {
  readonly linked: boolean;
  readonly tunnel: boolean;
  readonly revoked?: boolean;
}): EnvironmentCloudLinkStateResult {
  return {
    linked: input.linked,
    cloudUserId: input.linked ? "user" : null,
    relayUrl: input.linked ? "https://relay.example.test" : null,
    relayIssuer: null,
    managedTunnelActive: input.tunnel,
    publishAgentActivity: input.linked,
    linkRevoked: input.revoked ?? false,
  };
}

describe("cloudChangeReplacesLink", () => {
  it.each([
    {
      name: "linking a tunnel",
      state: { linked: false, tunnel: false },
      tunnel: true,
      expected: true,
    },
    {
      name: "repairing a revoked link",
      state: { linked: true, tunnel: true, revoked: true },
      tunnel: true,
      expected: true,
    },
    {
      name: "adding a tunnel to a publish-only link",
      state: { linked: true, tunnel: false },
      tunnel: true,
      expected: true,
    },
    {
      name: "unlinking",
      state: { linked: true, tunnel: true },
      tunnel: false,
      expected: false,
    },
    {
      name: "updating preferences for an active tunnel",
      state: { linked: true, tunnel: true },
      tunnel: true,
      expected: false,
    },
  ])("$name → $expected", ({ state, tunnel, expected }) => {
    expect(cloudChangeReplacesLink(linkState(state), undefined, { managedTunnel: tunnel })).toBe(
      expected,
    );
  });
});
