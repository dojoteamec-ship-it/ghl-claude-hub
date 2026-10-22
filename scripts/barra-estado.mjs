#!/usr/bin/env node
// Barra de estado de Claude Code: muestra la subcuenta activa de GHL que guarda ghl-api en
// .ghl/activa.json. Verde para prueba, rojo para producción. Nunca falla ni muestra secretos.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VERDE = "\x1b[32m";
const ROJO = "\x1b[1;31m";
const TENUE = "\x1b[2m";
const NORMAL = "\x1b[0m";

let entrada = {};
try {
  entrada = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  // Sin datos de Claude Code: se usa el directorio actual.
}
const raiz = entrada.workspace?.project_dir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let activa;
try {
  activa = JSON.parse(readFileSync(join(raiz, ".ghl", "activa.json"), "utf8"));
} catch {
  activa = undefined;
}

if (!activa?.alias) {
  process.stdout.write(`${TENUE}GHL: sin subcuenta elegida (ghl-api usa la de prueba)${NORMAL}`);
} else if (activa.entorno === "produccion") {
  process.stdout.write(`${ROJO}GHL: ${activa.alias} (PRODUCCIÓN)${NORMAL}`);
} else {
  process.stdout.write(`${VERDE}GHL: ${activa.alias} (${activa.entorno})${NORMAL}`);
}
