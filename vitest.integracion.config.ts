import { defineConfig } from "vitest/config";

// Pruebas contra la subcuenta de prueba real. Necesitan credenciales: ver docs/PROGRESO.md.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.integracion.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Una sola subcuenta: se corre en serie para no gastar la ráfaga de límites.
    fileParallelism: false,
  },
});
