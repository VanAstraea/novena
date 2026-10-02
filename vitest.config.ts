import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // the depot recogniser ships ES-module sources under lib/ without "type": "module"
    server: { deps: { inline: ["@arkntools/depot-recognition"] } },
  },
});
