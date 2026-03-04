import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@reducedmode/contracts": resolve(__dirname, "../contracts/src/index.ts"),
      "@reducedmode/adapters": resolve(__dirname, "../adapters/src/index.ts"),
      "@reducedmode/engine": resolve(__dirname, "./src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
