import { defineConfig } from "vitest/config";

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    env: {
      AI_MOCK_MODE: "true",
      SESSION_STATE_SECRET: "test-only-session-state-secret-32",
    },
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      include: ["components/**/*.{ts,tsx}", "lib/learning/**/*.ts", "functions/learning-api/src/**/*.ts"],
      exclude: ["**/*.d.ts"],
    },
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
