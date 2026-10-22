#!/usr/bin/env node
import { join } from "node:path";
import { ProveedorSubcuentasLocal, registradorConsola } from "@ghl-hub/ghl-core";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { EstadoActiva } from "./estado.js";
import { crearServidor } from "./servidor.js";

// Claude Code fija CLAUDE_PROJECT_DIR en el entorno del servidor con la raíz del proyecto.
const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const proveedor = new ProveedorSubcuentasLocal({
  rutaSubcuentas: join(raiz, "config", "subcuentas.json"),
  rutaEnv: join(raiz, ".env.local"),
});
const estado = new EstadoActiva(join(raiz, ".ghl", "activa.json"));

// Solo avisos y errores al log del servidor (stderr); stdout es el canal MCP.
const registrador = {
  registrar: (...args: Parameters<typeof registradorConsola.registrar>) => {
    if (args[0] !== "info") registradorConsola.registrar(...args);
  },
};

const manejador = serveStdio(() => crearServidor({ proveedor, estado, registrador }));
console.error("ghl-api escuchando por stdio");

process.on("SIGINT", () => {
  void manejador.close();
});
