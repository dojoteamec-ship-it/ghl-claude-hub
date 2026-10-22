// Utilidades de prueba: modelo y GHL simulados. No se incluyen en dist (ver tsconfig).
import type Anthropic from "@anthropic-ai/sdk";
import { ClienteGhl } from "@ghl-hub/ghl-core";
import { AlmacenMemoria } from "./almacen/memoria.js";
import type { SubcuentaBot } from "./almacen/tipos.js";
import { cifrar } from "./cifrado.js";
import type { LlamarModelo } from "./agente.js";
import { ServicioBot } from "./servicio.js";

export const CLAVE = Buffer.alloc(32, 7);
// Tokens falsos armados en tiempo de ejecución para que el escaneo de secretos no los marque.
export const pitDe = (alias: string) => "pit-" + `${alias}-`.padEnd(9, "0") + "1111-2222-3333-4444";

export interface LlamadaGhl {
  alias: string;
  token: string;
  metodo: string;
  ruta: string;
  locationId: string | null;
  cuerpo: unknown;
}

export function ghlFalso(llamadas: LlamadaGhl[]) {
  return (token: string, subcuenta: SubcuentaBot) =>
    new ClienteGhl({
      token,
      fetch: (url, init) => {
        const u = new URL(String(url));
        const cuerpo =
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : undefined;
        llamadas.push({
          alias: subcuenta.alias,
          token,
          metodo: init?.method ?? "GET",
          ruta: u.pathname,
          locationId:
            u.searchParams.get("locationId") ?? (cuerpo?.locationId as string | undefined) ?? null,
          cuerpo,
        });
        const contacto = {
          id: "C1",
          locationId: subcuenta.locationId,
          firstName: "Ana",
          tags: ["vip"],
        };
        let datos: unknown = {};
        if (u.pathname === "/contacts/search") datos = { contacts: [contacto], total: 1 };
        else if (/^\/contacts\/[^/]+$/.test(u.pathname) && init?.method === "DELETE")
          datos = { succeeded: true };
        else if (/^\/contacts\/[^/]+$/.test(u.pathname)) datos = { contact: contacto };
        else if (u.pathname.endsWith("/tags")) datos = { tags: ["vip", "nuevo"] };
        return Promise.resolve(new Response(JSON.stringify(datos), { status: 200 }));
      },
    });
}

type Bloque = Anthropic.Beta.BetaContentBlock;

export function respuestaModelo(
  content: Bloque[],
  stop_reason: Anthropic.Beta.BetaStopReason = "end_turn",
): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_prueba",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Beta.BetaMessage;
}

export const textoModelo = (texto: string) =>
  respuestaModelo([{ type: "text", text: texto, citations: null } as unknown as Bloque]);

export const usoHerramienta = (name: string, input: Record<string, unknown>, id = `tu_${name}`) =>
  respuestaModelo([{ type: "tool_use", id, name, input } as unknown as Bloque], "tool_use");

/** Modelo guionado: devuelve las respuestas en orden y guarda los parámetros recibidos. */
export function modeloGuionado(guion: (Anthropic.Beta.BetaMessage | Error)[]) {
  const recibidos: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const llamar: LlamarModelo = (p) => {
    recibidos.push(structuredClone(p));
    const siguiente = guion.shift();
    if (!siguiente) return Promise.reject(new Error("El guion se acabó."));
    return siguiente instanceof Error ? Promise.reject(siguiente) : Promise.resolve(siguiente);
  };
  return { llamar, recibidos };
}

/** Escenario: subcuentas a (prueba) y b (producción), un admin y un cliente de a. */
export async function escenario(
  guion: (Anthropic.Beta.BetaMessage | Error)[],
  ahora = () => new Date("2026-10-22T15:00:00Z"),
) {
  const almacen = new AlmacenMemoria(ahora);
  const a = await almacen.guardarSubcuenta({
    alias: "a",
    nombre: "Cliente A",
    locationId: "LOC_A",
    entorno: "prueba",
    pitCifrado: cifrar(pitDe("a"), CLAVE),
    topeDiarioUsd: 5,
    activa: true,
  });
  const b = await almacen.guardarSubcuenta({
    alias: "b",
    nombre: "Cliente B",
    locationId: "LOC_B",
    entorno: "produccion",
    pitCifrado: cifrar(pitDe("b"), CLAVE),
    topeDiarioUsd: 5,
    activa: true,
  });
  const admin = await almacen.guardarUsuario({
    telegramId: 100,
    nombre: "Santi",
    rol: "admin",
    subcuentaId: null,
    topeDiarioUsd: 10,
    activo: true,
  });
  const cliente = await almacen.guardarUsuario({
    telegramId: 200,
    nombre: "Cliente",
    rol: "cliente",
    subcuentaId: a.id,
    topeDiarioUsd: 2,
    activo: true,
  });
  await almacen.darAccesoAdmin(admin.id, a.id);
  await almacen.darAccesoAdmin(admin.id, b.id);
  const llamadas: LlamadaGhl[] = [];
  const modelo = modeloGuionado(guion);
  const servicio = new ServicioBot({
    almacen,
    clavePit: CLAVE,
    llamarModelo: modelo.llamar,
    crearCliente: ghlFalso(llamadas),
    ahora,
  });
  const deAdmin = { telegramId: 100, chatId: 100, chatPrivado: true };
  const deCliente = { telegramId: 200, chatId: 200, chatPrivado: true };
  return { almacen, servicio, a, b, admin, cliente, llamadas, modelo, deAdmin, deCliente };
}
