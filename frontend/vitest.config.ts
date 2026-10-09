import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mirrors tsconfig.json's `@/*` path so tested modules can use `@/` imports.
  // import.meta.url rather than __dirname: works whether Vite loads this file
  // as CommonJS (today) or as native ESM (planned default).
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
