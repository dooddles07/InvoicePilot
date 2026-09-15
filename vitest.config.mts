import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globalSetup: ["./src/server/test/global-setup.ts"],
    // Tests share one migrated database and isolate themselves with
    // transaction rollback, so files must not race to rebuild the schema.
    fileParallelism: false,
  },
});
