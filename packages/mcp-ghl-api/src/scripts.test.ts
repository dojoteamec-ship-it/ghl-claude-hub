import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aCsv, escribirExportacion, tabla } from "./exportar.js";

const script = (nombre: string) =>
  fileURLToPath(new URL(`../../../scripts/${nombre}`, import.meta.url));
const raizFalsa = () => mkdtempSync(join(tmpdir(), "ghl-scripts-"));
const correr = (nombre: string, entrada: unknown, env: Record<string, string> = {}) =>
  execFileSync("node", [script(nombre)], {
    input: JSON.stringify(entrada),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

describe("barra de estado", () => {
  it("muestra la subcuenta activa, en rojo si es de producción", () => {
    const raiz = raizFalsa();
    mkdirSync(join(raiz, ".ghl"));
    const activa = (entorno: string) =>
      writeFileSync(join(raiz, ".ghl", "activa.json"), JSON.stringify({ alias: "tomas", entorno }));
    const entrada = { workspace: { project_dir: raiz } };

    activa("prueba");
    expect(correr("barra-estado.mjs", entrada)).toBe("\x1b[32mGHL: tomas (prueba)\x1b[0m");
    activa("produccion");
    expect(correr("barra-estado.mjs", entrada)).toBe("\x1b[1;31mGHL: tomas (PRODUCCIÓN)\x1b[0m");
  });

  it("no falla sin archivo ni datos", () => {
    expect(correr("barra-estado.mjs", { workspace: { project_dir: raizFalsa() } })).toContain(
      "sin subcuenta",
    );
  });
});

describe("registro de acciones", () => {
  it("anota fecha, herramienta, subcuenta, tipo y resultado sin datos personales", () => {
    const raiz = raizFalsa();
    const comun = { CLAUDE_PROJECT_DIR: raiz };
    correr(
      "registro-acciones.mjs",
      {
        hook_event_name: "PostToolUse",
        tool_name: "mcp__ghl-api__crear_contacto",
        tool_input: { subcuenta: "prueba", email: "ana@ejemplo.com", simular: true },
        tool_response: [{ type: "text", text: 'SIMULACIÓN en "prueba"' }],
        duration_ms: 12,
      },
      comun,
    );
    correr(
      "registro-acciones.mjs",
      {
        hook_event_name: "PostToolUseFailure",
        tool_name: "mcp__ghl-oficial__execute_operation",
        tool_input: { operationId: "get-pipelines", params: { q: "ana@ejemplo.com" } },
        error: "falló",
      },
      comun,
    );
    const texto = readFileSync(join(raiz, "logs", "acciones-ghl.jsonl"), "utf8");
    const [primera, segunda] = texto
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(primera).toMatchObject({
      servidor: "ghl-api",
      herramienta: "crear_contacto",
      subcuenta: "prueba",
      resultado: "ok",
      simulado: true,
      duracionMs: 12,
    });
    expect(typeof primera?.fecha).toBe("string");
    expect(segunda).toMatchObject({
      servidor: "ghl-oficial",
      tipo: "ejecucion",
      operacion: "get-pipelines",
      resultado: "error",
    });
    expect(texto).not.toContain("ana@ejemplo.com");
  });

  it("nunca rompe con entradas raras", () => {
    expect(() =>
      execFileSync("node", [script("registro-acciones.mjs")], { input: "no es json" }),
    ).not.toThrow();
  });
});

describe("exportar", () => {
  const resultado = {
    total: 2,
    contactos: [
      { id: "C1", nombre: 'Ana, "la jefa"', tags: ["vip", "es_prueba"], meta: { origen: "web" } },
      { id: "C2", nombre: "Peña", tags: [] },
    ],
  };

  it("aplana la lista principal en columnas", () => {
    const t = tabla(resultado);
    expect(t.columnas).toEqual(["id", "nombre", "tags", "meta.origen"]);
    expect(t.filas[0]).toEqual(["C1", 'Ana, "la jefa"', "vip, es_prueba", "web"]);
  });

  it("escapa el CSV y agrega BOM para Excel", () => {
    const csv = aCsv(tabla(resultado));
    expect(csv.startsWith("﻿id,nombre,tags,meta.origen\r\n")).toBe(true);
    expect(csv).toContain('"Ana, ""la jefa"""');
    expect(csv).toContain("Peña");
  });

  it("escribe un XLSX válido", async () => {
    const carpeta = raizFalsa();
    const { ruta, filas } = await escribirExportacion({
      carpeta,
      nombre: "contactos",
      alias: "prueba",
      formato: "xlsx",
      resultado,
      ahora: new Date("2026-10-22T15:04:05Z"),
    });
    expect(ruta).toBe(join(carpeta, "contactos-prueba-20261022-150405.xlsx"));
    expect(filas).toBe(2);
    // Un XLSX es un ZIP: empieza con "PK".
    expect(readFileSync(ruta).subarray(0, 2).toString()).toBe("PK");
  });
});
