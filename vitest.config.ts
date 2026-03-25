import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts"
    ]
  },
  resolve: {
    alias: {
      "@nexusmind/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@nexusmind/core/*": resolve(__dirname, "packages/core/src/*"),
      "@nexusmind/graph": resolve(__dirname, "packages/graph/src/index.ts"),
      "@nexusmind/graph/*": resolve(__dirname, "packages/graph/src/*"),
      "@nexusmind/billing": resolve(__dirname, "packages/billing/src/index.ts"),
      "@nexusmind/billing/*": resolve(__dirname, "packages/billing/src/*")
    }
  }
});
