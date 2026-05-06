import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@pr-agent/capability-types": path.resolve(__dirname, "../capability-types/src/index.ts"),
      "@pr-agent/capability-sdk": path.resolve(__dirname, "../capability-sdk/src/index.ts"),
      "@pr-agent/capability-registry": path.resolve(__dirname, "../capability-registry/src/index.ts"),
    },
  },
});
