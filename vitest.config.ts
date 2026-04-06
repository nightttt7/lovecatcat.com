import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/test/**/*.ts",
        "src/db/types.ts",
        "src/server.ts",
        "src/worker.ts"
      ],
      thresholds: {
        statements: 68,
        lines: 68,
        branches: 72,
        functions: 95
      }
    }
  }
});
