// pnpm bot:mcp: prueba si el MCP oficial anthropic/v2 acepta el PIT como authorization_token del
// conector MCP de la API de Claude. Solo habilita herramientas de consulta del catálogo; nunca
// execute_operation, porque el conector lo correría en servidores de Anthropic sin confirmación.
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { ProveedorSubcuentasLocal } from "@ghl-hub/ghl-core";
import { RAIZ, cargarVariables } from "../config.js";
import { salir } from "./terminal.js";

const v = cargarVariables();
if (!v.ANTHROPIC_API_KEY) salir("Falta ANTHROPIC_API_KEY. Corre pnpm bot:configurar.");
const token = existsSync(`${RAIZ}config/subcuentas.json`)
  ? await new ProveedorSubcuentasLocal({
      rutaSubcuentas: `${RAIZ}config/subcuentas.json`,
      rutaEnv: `${RAIZ}.env.local`,
    }).obtenerToken("prueba")
  : (v.GHL_PRIVATE_TOKEN ?? salir("Falta config/subcuentas.json."));

const anthropic = new Anthropic({ apiKey: v.ANTHROPIC_API_KEY });
try {
  const r = await anthropic.beta.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 1024,
    betas: ["mcp-client-2025-11-20"],
    mcp_servers: [
      {
        type: "url",
        url: "https://services.leadconnectorhq.com/mcp/anthropic/v2",
        name: "ghl",
        authorization_token: token,
      },
    ],
    tools: [
      {
        type: "mcp_toolset",
        mcp_server_name: "ghl",
        default_config: { enabled: false },
        configs: { search_operations: { enabled: true }, describe_operation: { enabled: true } },
      },
    ],
    messages: [
      {
        role: "user",
        content:
          'Usa search_operations para buscar "list pipelines" y dime el operationId que encuentres. Nada más.',
      },
    ],
  });
  const usos = r.content
    .filter((b) => b.type === "mcp_tool_use")
    .map((b) => (b as { name: string }).name);
  const errores = r.content.filter(
    (b) => b.type === "mcp_tool_result" && (b as { is_error?: boolean }).is_error,
  ).length;
  const texto = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join(" ");
  console.log(
    `Herramientas MCP usadas: ${usos.join(", ") || "ninguna"}; resultados con error: ${errores}.`,
  );
  console.log(`Respuesta: ${texto.slice(0, 300)}`);
  console.log(
    usos.length && !errores
      ? "\nRESULTADO: el conector acepta el PIT."
      : "\nRESULTADO: el conector no pudo usar el MCP con el PIT.",
  );
} catch (error) {
  console.log(
    `RESULTADO: la API rechazó la petición (${error instanceof Anthropic.APIError ? `${error.status}` : "error"}): ${error instanceof Error ? error.message.slice(0, 300) : ""}`,
  );
}
