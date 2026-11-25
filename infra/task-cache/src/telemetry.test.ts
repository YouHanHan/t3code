// @effect-diagnostics nodeBuiltinImport:off - launcher integration with filesystem and fetch.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it, vi } from "vite-plus/test";

it("leaves legacy telemetry on disk even when the flusher is invoked directly", async () => {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "cache-queue-"));
  const queue = NodePath.join(home, ".cache/t3-task-cache/telemetry");
  const report = NodePath.join(queue, "record.json");
  const payload = JSON.stringify({
    endpoint: "https://cache.example.test/projects/test",
    event: { id: "legacy", host: "local-fixture" },
  });
  try {
    NodeFS.mkdirSync(queue, { recursive: true });
    NodeFS.writeFileSync(report, payload);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("GITHUB_ACTIONS", undefined);
    vi.stubEnv("VP_REMOTE_CACHE_URL", "https://user:fixture@cache.example.test/projects/test");
    using request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    await import("./flush.ts");
    expect(request).not.toHaveBeenCalled();
    expect(NodeFS.readFileSync(report, "utf8")).toBe(payload);
  } finally {
    vi.unstubAllEnvs();
    NodeFS.rmSync(home, { recursive: true, force: true });
  }
});
