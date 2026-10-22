import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { z } from "zod";

/** Raíz del repositorio, también cuando se corre desde apps/bot-telegram/dist. */
export const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

const esquema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, "TELEGRAM_BOT_TOKEN no tiene el formato de @BotFather."),
  TELEGRAM_ADMIN_ID: z.coerce
    .number()
    .int()
    .positive("TELEGRAM_ADMIN_ID debe ser tu ID numérico de Telegram."),
  ANTHROPIC_API_KEY: z.string().min(20, "Falta ANTHROPIC_API_KEY."),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODELO_TRANSCRIPCION: z.string().optional(),
  SUPABASE_URL: z.url("SUPABASE_URL debe ser la URL del proyecto."),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "Falta SUPABASE_SERVICE_ROLE_KEY."),
  BOT_ENCRYPTION_KEY: z.string().min(40, "Falta BOT_ENCRYPTION_KEY (32 bytes en base64)."),
});
export type ConfigBot = z.infer<typeof esquema>;

/** Variables de .env.local más las del entorno (estas ganan). Nunca se imprimen. */
export function cargarVariables(entorno: Record<string, string | undefined> = process.env) {
  const ruta = `${RAIZ}.env.local`;
  const delArchivo = existsSync(ruta) ? parseEnv(readFileSync(ruta, "utf8")) : {};
  const todas: Record<string, string | undefined> = { ...delArchivo, ...entorno };
  // Las vacías cuentan como ausentes.
  return Object.fromEntries(
    Object.entries(todas).filter(([, v]) => v !== undefined && v.trim() !== ""),
  );
}

export function cargarConfig(entorno?: Record<string, string | undefined>): ConfigBot {
  const resultado = esquema.safeParse(cargarVariables(entorno));
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `- ${i.message}`).join("\n");
    throw new Error(`Faltan o están mal variables en .env.local:\n${problemas}`);
  }
  return resultado.data;
}
