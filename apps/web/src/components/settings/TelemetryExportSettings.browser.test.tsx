import { expect, it } from "vite-plus/test";
import { searchSettings } from "./settingsSearch";

it("does not offer the retired telemetry export setting", () => {
  const results = searchSettings("OpenTelemetry export");
  expect(results.some((result) => result.id === "telemetry-export")).toBe(false);
});
