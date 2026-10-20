import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { esquemaArchivoSubcuentas, variablePit } from "./subcuentas.js";

const rutaEjemplo = new URL("../../../config/subcuentas.example.json", import.meta.url);

describe("archivo de subcuentas", () => {
  it("acepta config/subcuentas.example.json", () => {
    const contenido: unknown = JSON.parse(readFileSync(rutaEjemplo, "utf8"));
    const resultado = esquemaArchivoSubcuentas.safeParse(contenido);
    expect(resultado.success).toBe(true);
  });

  it("rechaza alias repetidos", () => {
    const sub = { alias: "prueba", nombre: "A", locationId: "x", entorno: "prueba" };
    expect(esquemaArchivoSubcuentas.safeParse({ subcuentas: [sub, sub] }).success).toBe(false);
  });

  it("rechaza un entorno desconocido", () => {
    const sub = { alias: "prueba", nombre: "A", locationId: "x", entorno: "staging" };
    expect(esquemaArchivoSubcuentas.safeParse({ subcuentas: [sub] }).success).toBe(false);
  });
});

describe("variablePit", () => {
  it("arma el nombre de la variable en mayúsculas", () => {
    expect(variablePit("cliente1")).toBe("GHL_PIT_CLIENTE1");
  });
});
