import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The schedule parser is pure — no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
