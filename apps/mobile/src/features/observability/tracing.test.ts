import { expect, it, vi } from "vite-plus/test";

import config from "../../../app.config.ts";
import { resolveCloudPublicConfig } from "../cloud/publicConfig";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        relay: { url: "https://relay.example" },
        observability: {
          tracesUrl: "https://collector.example/v1/traces",
          tracesDataset: "mobile",
          tracesToken: "test-token",
        },
      },
    },
  },
}));

vi.mock("../../../../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () => ({
    T3CODE_RELAY_URL: "https://relay.example",
    EXPO_PUBLIC_OTLP_TRACES_URL: "https://collector.example/v1/traces",
    EXPO_PUBLIC_OTLP_TRACES_DATASET: "mobile",
    EXPO_PUBLIC_OTLP_TRACES_TOKEN: "test-token",
    T3CODE_ANDROID_GOOGLE_SERVICES_FILE: "google-services.json",
  }),
}));

it("omits telemetry destinations from new builds and ignores them in older manifests", () => {
  expect(config.extra).not.toHaveProperty("observability");
  expect(config.extra?.eas).not.toHaveProperty("observe");
  expect(config.android).not.toHaveProperty("googleServicesFile");
  expect(resolveCloudPublicConfig()).not.toHaveProperty("observability");
  expect(resolveCloudPublicConfig().relay.url).toBe("https://relay.example");
});
