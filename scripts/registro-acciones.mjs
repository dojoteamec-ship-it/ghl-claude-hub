#!/usr/bin/env node
// Hook PostToolUse y PostToolUseFailure de las herramientas de GHL. Agrega una línea a
// logs/acciones-ghl.jsonl con fecha, herramienta, subcuenta, tipo y resultado. No guarda los
// argumentos ni la respuesta, para no dejar datos personales. Nunca bloquea a Claude Code.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

try {
  const evento = JSON.parse(readFileSync(0, "utf8") || "{}");
  const raiz = process.env.CLAUDE_PROJECT_DIR ?? evento.cwd ?? process.cwd();
  const [, servidor = "", herramienta = ""] = String(evento.tool_name ?? "").split("__");
  const entrada = evento.tool_input ?? {};

  let subcuenta = typeof entrada.subcuenta === "string" ? entrada.subcuenta : undefined;
  if (!subcuenta && servidor === "ghl-api") {
    try {
      subcuenta = JSON.parse(readFileSync(join(raiz, ".ghl", "activa.json"), "utf8")).alias;
    } catch {
      subcuenta = "prueba (por defecto)";
    }
  }
  if (servidor === "ghl-oficial") subcuenta = "oauth";

  // Tipo según el catálogo de ghl-core (si está compilado) o según la herramienta oficial.
  let tipo = "desconocido";
  const catalogo = join(raiz, "packages", "ghl-core", "dist", "index.js");
  if (servidor === "ghl-api" && existsSync(catalogo)) {
    const { catalogo: operaciones } = await import(pathToFileURL(catalogo).href);
    const aSnake = (n) => n.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    tipo = operaciones.find((o) => aSnake(o.nombre) === herramienta)?.tipo ?? "contexto";
  } else if (servidor === "ghl-oficial") {
    tipo = herramienta === "execute_operation" ? "ejecucion" : "lectura";
  }

  const respuesta = JSON.stringify(evento.tool_response ?? "");
  const fallo =
    evento.hook_event_name === "PostToolUseFailure" ||
    evento.tool_response?.isError === true ||
    /"isError":\s*true/.test(respuesta);

  const linea = {
    fecha: new Date().toISOString(),
    servidor,
    herramienta,
    subcuenta: subcuenta ?? null,
    tipo,
    resultado: fallo ? "error" : "ok",
    simulado: entrada.simular === true || /SIMULACIÓN/.test(respuesta),
    ...(servidor === "ghl-oficial" && typeof entrada.operationId === "string"
      ? { operacion: entrada.operationId }
      : {}),
    ...(typeof evento.duration_ms === "number" ? { duracionMs: evento.duration_ms } : {}),
  };
  mkdirSync(join(raiz, "logs"), { recursive: true });
  appendFileSync(join(raiz, "logs", "acciones-ghl.jsonl"), JSON.stringify(linea) + "\n");
} catch (error) {
  console.error(`registro-acciones: ${error instanceof Error ? error.message : String(error)}`);
}
