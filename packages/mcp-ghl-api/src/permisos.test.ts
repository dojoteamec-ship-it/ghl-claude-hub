import { readdirSync, readFileSync } from "node:fs";
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
    for (const n of [
      "listar_subcuentas",
      "subcuenta_activa",
      "seleccionar_subcuenta",
      "comparar_subcuentas",
      "exportar",
    ]) {
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

describe("skills de .claude/skills", () => {
  const carpeta = new URL("../../../.claude/skills/", import.meta.url);
  const skills = readdirSync(carpeta, { withFileTypes: true }).filter((d) => d.isDirectory());
  const existentes = new Set([
    ...catalogo.map((o) => aSnake(o.nombre)),
    "listar_subcuentas",
    "seleccionar_subcuenta",
    "subcuenta_activa",
    "comparar_subcuentas",
    "exportar",
  ]);

  it("están los ocho comandos del plan", () => {
    expect(skills.map((d) => d.name).sort()).toEqual([
      "auditoria",
      "briefing",
      "comparar-subcuentas",
      "exportar",
      "limpieza",
      "pipeline",
      "seguimiento",
      "subcuenta",
    ]);
  });

  it("cada skill tiene frontmatter y solo nombra herramientas que existen", () => {
    for (const { name } of skills) {
      const texto = readFileSync(new URL(`${name}/SKILL.md`, carpeta), "utf8");
      expect(texto.startsWith("---\n"), name).toBe(true);
      expect(texto, name).toMatch(/^description: .{20,}/m);
      for (const [, herramienta] of texto.matchAll(/mcp__ghl-api__([a-z_]+)/g)) {
        expect(existentes, `${name}: ${herramienta}`).toContain(herramienta);
      }
      for (const [, herramienta] of texto.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
        if (
          herramienta &&
          /^(buscar|listar|obtener|crear|actualizar|agregar|quitar|leer|enviar|borrar|resumen|auditoria|leads|citas|oportunidades|seleccionar|subcuenta|comparar|exportar|horarios|mover|cambiar)_/.test(
            herramienta,
          )
        ) {
          expect(existentes, `${name}: ${herramienta}`).toContain(herramienta);
        }
      }
    }
  });

  it("seguimiento nunca envía y limpieza no se invoca sola", () => {
    const seguimiento = readFileSync(new URL("seguimiento/SKILL.md", carpeta), "utf8");
    expect(seguimiento).not.toMatch(/allowed-tools:.*enviar_mensaje/);
    const limpieza = readFileSync(new URL("limpieza/SKILL.md", carpeta), "utf8");
    expect(limpieza).toMatch(/^disable-model-invocation: true$/m);
    expect(limpieza).not.toMatch(/allowed-tools:.*(agregar_tags|actualizar|borrar)/);
  });
});
