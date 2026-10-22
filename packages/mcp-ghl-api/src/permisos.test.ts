import { readFileSync } from "node:fs";
import { catalogo } from "@ghl-hub/ghl-core";
import { describe, expect, it } from "vitest";
import { aSnake } from "./nombres.js";

const ajustes = JSON.parse(
  readFileSync(new URL("../../../.claude/settings.json", import.meta.url), "utf8"),
) as { permissions: { allow: string[]; ask: string[] } };
const herramienta = (nombre: string) => `mcp__ghl-api__${nombre}`;

describe(".claude/settings.json y el catálogo", () => {
  it("permite toda lectura y pide confirmación para toda escritura", () => {
    for (const o of catalogo) {
      const regla = herramienta(aSnake(o.nombre));
      if (o.tipo === "lectura") expect(ajustes.permissions.allow, regla).toContain(regla);
      else expect(ajustes.permissions.ask, regla).toContain(regla);
    }
    for (const n of ["listar_subcuentas", "subcuenta_activa", "seleccionar_subcuenta"]) {
      expect(ajustes.permissions.allow).toContain(herramienta(n));
    }
  });
});

describe("aSnake", () => {
  it("convierte camelCase a snake_case", () => {
    expect(aSnake("buscarContactos")).toBe("buscar_contactos");
    expect(aSnake("oportunidadesSinMovimiento")).toBe("oportunidades_sin_movimiento");
  });
});
