// pnpm bot:configurar: pide las claves del bot, las valida y las guarda en .env.local sin
// mostrarlas. Lo que ya está configurado se puede conservar con Enter.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { RAIZ } from "../config.js";
import { crearTerminal } from "./terminal.js";

const ruta = `${RAIZ}.env.local`;
const actuales = existsSync(ruta) ? parseEnv(readFileSync(ruta, "utf8")) : {};
const t = crearTerminal();
const nuevos: Record<string, string> = {};

async function pedir(
  nombre: string,
  texto: string,
  opciones: { oculto?: boolean; validar?: (v: string) => Promise<string | undefined> },
) {
  const ya = actuales[nombre];
  for (let intento = 0; intento < 3; intento += 1) {
    const sufijo = ya ? " (Enter para dejar el actual)" : "";
    const valor = opciones.oculto
      ? await t.preguntarOculto(`${texto}${sufijo}: `)
      : await t.preguntar(`${texto}${sufijo}: `);
    if (!valor && ya) return;
    if (!valor) continue;
    const problema = await opciones.validar?.(valor);
    if (!problema) {
      nuevos[nombre] = valor;
      return;
    }
    console.error(`  ${problema}`);
  }
  console.error(`  Se omitió ${nombre}.`);
}

const okHttp = async (url: string, init?: RequestInit) =>
  (await fetch(url, init).catch(() => undefined))?.ok === true;

console.log("Configuración del bot. Lo que pegues en los campos ocultos no se verá en pantalla.\n");
await pedir("TELEGRAM_BOT_TOKEN", "Token del bot de @BotFather", {
  oculto: true,
  validar: async (v) =>
    (await okHttp(`https://api.telegram.org/bot${v}/getMe`))
      ? undefined
      : "Telegram no aceptó ese token.",
});
await pedir("TELEGRAM_ADMIN_ID", "Tu ID numérico de Telegram (de @userinfobot)", {
  validar: (v) => Promise.resolve(/^\d{5,}$/.test(v) ? undefined : "Debe ser solo números."),
});
await pedir("ANTHROPIC_API_KEY", "API key de Anthropic (console.anthropic.com)", {
  oculto: true,
  validar: async (v) =>
    (await okHttp("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": v, "anthropic-version": "2023-06-01" },
    }))
      ? undefined
      : "Anthropic no aceptó esa clave.",
});
await pedir("OPENAI_API_KEY", "API key de OpenAI para notas de voz (opcional, Enter para omitir)", {
  oculto: true,
  validar: async (v) =>
    (await okHttp("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${v}` },
    }))
      ? undefined
      : "OpenAI no aceptó esa clave.",
});
await pedir("SUPABASE_URL", "URL del proyecto de Supabase (https://xxxx.supabase.co)", {
  validar: (v) =>
    Promise.resolve(
      /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v)
        ? undefined
        : "Debe verse como https://xxxx.supabase.co",
    ),
});
await pedir("SUPABASE_SERVICE_ROLE_KEY", "Service role key de Supabase (secreta)", {
  oculto: true,
  validar: async (v) => {
    const url = (nuevos.SUPABASE_URL ?? actuales.SUPABASE_URL ?? "").replace(/\/$/, "");
    const r = await fetch(`${url}/rest/v1/subcuentas?select=id&limit=1`, {
      headers: { apikey: v, Authorization: `Bearer ${v}` },
    }).catch(() => undefined);
    if (r?.ok) return undefined;
    if (r?.status === 404 || r?.status === 400)
      return "La clave funciona, pero falta la tabla subcuentas: corre primero la migración en Supabase.";
    return "Supabase no aceptó esa clave.";
  },
});
if (!actuales.BOT_ENCRYPTION_KEY) {
  nuevos.BOT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  console.log(
    "Generé BOT_ENCRYPTION_KEY. Guárdala también en un gestor de contraseñas: sin ella no se pueden leer los PIT guardados.",
  );
}
t.cerrar();

const lineas = existsSync(ruta) ? readFileSync(ruta, "utf8").split("\n") : [];
const sinCambiados = lineas.filter(
  (l) => !Object.keys(nuevos).some((k) => l.startsWith(`${k}=`)) && l !== "",
);
writeFileSync(
  ruta,
  [...sinCambiados, ...Object.entries(nuevos).map(([k, v]) => `${k}=${v}`)].join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  `\nListo: ${Object.keys(nuevos).length} variable(s) actualizada(s) en .env.local: ${Object.keys(nuevos).join(", ") || "ninguna"}.`,
);
