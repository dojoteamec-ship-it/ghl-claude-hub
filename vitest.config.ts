import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    // Las pruebas de integración contra GHL viven en *.integracion.test.ts y se corren aparte.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integracion.test.ts"],
  },
});
