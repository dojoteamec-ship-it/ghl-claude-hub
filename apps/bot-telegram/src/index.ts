#!/usr/bin/env node
import Anthropic from "@anthropic-ai/sdk";
import { registradorConsola } from "@ghl-hub/ghl-core";
import { AlmacenSupabase } from "./almacen/supabase.js";
import { claveDesdeBase64 } from "./cifrado.js";
import { cargarConfig } from "./config.js";
import { ServicioBot } from "./servicio.js";
import { crearBot } from "./telegram.js";
import { MODELO_TRANSCRIPCION, crearTranscriptor } from "./voz.js";

const config = cargarConfig();
const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
const almacen = new AlmacenSupabase(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const servicio = new ServicioBot({
  almacen,
  clavePit: claveDesdeBase64(config.BOT_ENCRYPTION_KEY),
  llamarModelo: (parametros) => anthropic.beta.messages.create(parametros),
  // Solo avisos y errores de GHL al log, ya redactados.
  registrador: {
    registrar: (nivel, evento, datos) =>
      nivel !== "info" && registradorConsola.registrar(nivel, evento, datos),
  },
});
const bot = crearBot({
  token: config.TELEGRAM_BOT_TOKEN,
  adminId: config.TELEGRAM_ADMIN_ID,
  servicio,
  ...(config.OPENAI_API_KEY
    ? {
        transcribir: crearTranscriptor(
          config.OPENAI_API_KEY,
          config.OPENAI_MODELO_TRANSCRIPCION ?? MODELO_TRANSCRIPCION,
        ),
      }
    : {}),
});

await almacen
  .limpiarRetencion()
  .catch(() => console.error("No se pudo limpiar la retención al arrancar."));
setInterval(() => void almacen.limpiarRetencion().catch(() => undefined), 6 * 3_600_000).unref();

await bot.api.setMyCommands([
  { command: "ayuda", description: "Qué puedo hacer" },
  { command: "yo", description: "Tu usuario y tu subcuenta" },
  { command: "cancelar", description: "Cancela lo pendiente y empieza de cero" },
  { command: "subcuenta", description: "Cambiar de subcuenta (admin)" },
  { command: "uso", description: "Costos por subcuenta (admin)" },
]);
console.error("Bot de Telegram en marcha (polling). Ctrl+C para detener.");
process.once("SIGINT", () => void bot.stop());
process.once("SIGTERM", () => void bot.stop());
await bot.start({ drop_pending_updates: true });
