import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProveedorSubcuentasLocal } from "./proveedor-local.js";

const pit = "pit-" + "1a2b3c4d-".repeat(4);

function preparar(subcuentas: unknown, env = "") {
  const carpeta = mkdtempSync(join(tmpdir(), "ghl-core-"));
  const rutaSubcuentas = join(carpeta, "subcuentas.json");
  const rutaEnv = join(carpeta, ".env.local");
  writeFileSync(rutaSubcuentas, JSON.stringify(subcuentas));
  writeFileSync(rutaEnv, env);
  return { rutaSubcuentas, rutaEnv };
}

const archivo = {
  subcuentas: [{ alias: "prueba", nombre: "Prueba", locationId: "L1", entorno: "prueba" }],
};

describe("ProveedorSubcuentasLocal", () => {
  it("lista subcuentas y lee el PIT de .env.local", async () => {
    const rutas = preparar(archivo, `GHL_PIT_PRUEBA=${pit}\n`);
    const proveedor = new ProveedorSubcuentasLocal({ ...rutas, entorno: {} });
    await expect(proveedor.listar()).resolves.toHaveLength(1);
    await expect(proveedor.obtener("prueba")).resolves.toMatchObject({ locationId: "L1" });
    await expect(proveedor.obtenerToken("prueba")).resolves.toBe(pit);
  });

  it("el entorno tiene prioridad sobre .env.local", async () => {
    const rutas = preparar(archivo, "GHL_PIT_PRUEBA=del-archivo\n");
    const proveedor = new ProveedorSubcuentasLocal({ ...rutas, entorno: { GHL_PIT_PRUEBA: pit } });
    await expect(proveedor.obtenerToken("prueba")).resolves.toBe(pit);
  });

  it("explica en español qué falta", async () => {
    const rutas = preparar(archivo);
    const proveedor = new ProveedorSubcuentasLocal({ ...rutas, entorno: {} });
    await expect(proveedor.obtenerToken("prueba")).rejects.toThrow(/GHL_PIT_PRUEBA/);
    await expect(proveedor.obtener("otra")).rejects.toThrow(/No existe la subcuenta "otra"/);
  });

  it("rechaza un archivo inválido o ausente", async () => {
    const rutas = preparar({ subcuentas: [] });
    await expect(new ProveedorSubcuentasLocal({ ...rutas, entorno: {} }).listar()).rejects.toThrow(
      /subcuentas.json/,
    );
    const ausente = new ProveedorSubcuentasLocal({
      rutaSubcuentas: "/no/existe.json",
      entorno: {},
    });
    await expect(ausente.listar()).rejects.toThrow(/subcuentas.example.json/);
  });
});
