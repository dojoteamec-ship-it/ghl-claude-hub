import { ClienteGhl, type OpcionesCliente } from "../cliente.js";
import type { ContextoOperacion } from "../operacion.js";
import type { Subcuenta } from "../subcuentas.js";

export interface Llamada {
  url: URL;
  metodo: string;
  cabeceras: Record<string, string>;
  cuerpo: unknown;
}

type Respuesta = { estado?: number; cuerpo?: unknown; cabeceras?: Record<string, string> } | Error;

/** fetch falso que devuelve las respuestas en orden y registra cada llamada. */
export function fetchFalso(respuestas: Respuesta[] | ((llamada: Llamada) => Respuesta)) {
  const llamadas: Llamada[] = [];
  const cola = Array.isArray(respuestas) ? [...respuestas] : undefined;
  const fetch = (url: URL | string | Request, init?: RequestInit): Promise<Response> => {
    const llamada: Llamada = {
      url: new URL(String(url)),
      metodo: init?.method ?? "GET",
      cabeceras: (init?.headers ?? {}) as Record<string, string>,
      cuerpo: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    llamadas.push(llamada);
    const r = cola ? cola.shift() : (respuestas as (l: Llamada) => Respuesta)(llamada);
    if (r === undefined) return Promise.reject(new Error("Sin respuesta preparada"));
    if (r instanceof Error) return Promise.reject(r);
    const cuerpo = r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo);
    return Promise.resolve(
      new Response(cuerpo, { status: r.estado ?? 200, headers: r.cabeceras ?? {} }),
    );
  };
  return { fetch: fetch as typeof globalThis.fetch, llamadas };
}

// Token falso armado en tiempo de ejecución para que el escaneo de secretos no lo marque.
export const TOKEN_FALSO = "pit-" + "0f0f0f0f-".repeat(4) + "prueba";

export function clienteFalso(
  respuestas: Parameters<typeof fetchFalso>[0],
  opciones: Partial<OpcionesCliente> = {},
) {
  const falso = fetchFalso(respuestas);
  const esperas: number[] = [];
  const cliente = new ClienteGhl({
    token: TOKEN_FALSO,
    fetch: falso.fetch,
    dormir: (ms) => {
      esperas.push(ms);
      return Promise.resolve();
    },
    azar: () => 0.5,
    ...opciones,
  });
  return { cliente, llamadas: falso.llamadas, esperas };
}

export const SUBCUENTA_PRUEBA: Subcuenta = {
  alias: "prueba",
  nombre: "Prueba",
  locationId: "LOC_PRUEBA",
  entorno: "prueba",
  notas: "",
};

export function contexto(
  respuestas: Parameters<typeof fetchFalso>[0],
  extra: Partial<ContextoOperacion> = {},
) {
  const { cliente, llamadas } = clienteFalso(respuestas);
  return { ctx: { cliente, subcuenta: SUBCUENTA_PRUEBA, ...extra }, llamadas };
}
