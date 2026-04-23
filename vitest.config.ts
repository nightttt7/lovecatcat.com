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
        "src/translation/types.ts",
        "src/assets/post-editor-preview.generated.ts",
        "src/markdown/browser-preview.ts",
        "src/markdown/preview-controller.ts",
        "src/server.ts",
        "src/worker.ts"
      ],
      thresholds: {
        statements: 90,
        lines: 90,
        branches: 75,
        functions: 92
      }
    }
  }
});
