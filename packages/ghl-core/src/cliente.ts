import { ErrorGhl, detalleDeCuerpo, tipoPorEstado } from "./errores.js";
import {
  type EstadoLimites,
  Semaforo,
  calcularEspera,
  esperaRetryAfter,
  leerLimites,
} from "./limites.js";
import { type Registrador, registradorSeguro, registradorSilencioso } from "./registro.js";

export const URL_BASE_GHL = "https://services.leadconnectorhq.com";
/** Versión de la API verificada en la Etapa 3 (ver docs/DECISIONES.md). */
export const VERSION_API_GHL = "v3";

/** Lee GHL_API_BASE y GHL_API_VERSION; si faltan, usa los valores verificados. */
export function configuracionApi(entorno: Record<string, string | undefined> = process.env): {
  baseUrl: string;
  version: string;
} {
  return {
    baseUrl: entorno.GHL_API_BASE?.trim() || URL_BASE_GHL,
    version: entorno.GHL_API_VERSION?.trim() || VERSION_API_GHL,
  };
}

export type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ValorQuery = string | number | boolean | readonly string[] | undefined;

export interface Peticion {
  metodo: Metodo;
  /** Ruta que empieza con "/", con los parámetros de ruta ya codificados. */
  ruta: string;
  query?: Record<string, ValorQuery>;
  cuerpo?: unknown;
}

export interface OpcionesCliente {
  token: string;
  baseUrl?: string;
  version?: string;
  /** Peticiones simultáneas por subcuenta. */
  concurrencia?: number;
  /** Reintentos ante 429, 5xx o falla de red. */
  reintentos?: number;
  esperaBaseMs?: number;
  esperaMaximaMs?: number;
  tiempoLimiteMs?: number;
  registrador?: Registrador;
  // Inyectables para pruebas.
  fetch?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  azar?: () => number;
}

const dormirReal = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Arma la URL con la query; los arreglos se repiten como clave=valor. */
export function construirUrl(base: string, ruta: string, query?: Record<string, ValorQuery>) {
  const url = new URL(ruta, base);
  for (const [clave, valor] of Object.entries(query ?? {})) {
    if (valor === undefined) continue;
    if (Array.isArray(valor)) {
      for (const v of valor as readonly string[]) url.searchParams.append(clave, v);
    } else {
      url.searchParams.set(clave, String(valor));
    }
  }
  return url;
}

/**
 * Cliente HTTP de la API de GHL para una subcuenta. Respeta los límites, reintenta con espera
 * exponencial, limita la concurrencia y normaliza los errores. Nunca registra cuerpos ni tokens.
 *
 * Reintentos: GET, PUT y DELETE se reintentan ante 429, 5xx y fallas de red. POST y PATCH solo
 * ante 429, porque un 5xx o un corte pueden llegar después de que GHL ya creó el recurso.
 */
export class ClienteGhl {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly reintentos: number;
  private readonly esperaBaseMs: number;
  private readonly esperaMaximaMs: number;
  private readonly tiempoLimiteMs: number;
  private readonly registrador: Registrador;
  private readonly fetch: typeof fetch;
  private readonly dormir: (ms: number) => Promise<void>;
  private readonly azar: () => number;
  private readonly semaforo: Semaforo;
  private estadoLimites: EstadoLimites = {};

  constructor(opciones: OpcionesCliente) {
    if (!opciones.token.trim()) {
      throw new ErrorGhl({ tipo: "configuracion", detalle: "Falta el token de la subcuenta." });
    }
    this.token = opciones.token;
    this.baseUrl = opciones.baseUrl ?? URL_BASE_GHL;
    this.version = opciones.version ?? VERSION_API_GHL;
    this.reintentos = opciones.reintentos ?? 4;
    this.esperaBaseMs = opciones.esperaBaseMs ?? 500;
    this.esperaMaximaMs = opciones.esperaMaximaMs ?? 30_000;
    this.tiempoLimiteMs = opciones.tiempoLimiteMs ?? 30_000;
    this.registrador = registradorSeguro(opciones.registrador ?? registradorSilencioso);
    this.fetch = opciones.fetch ?? globalThis.fetch.bind(globalThis);
    this.dormir = opciones.dormir ?? dormirReal;
    this.azar = opciones.azar ?? Math.random;
    this.semaforo = new Semaforo(opciones.concurrencia ?? 4);
  }

  /** Último estado de límites informado por GHL. */
  get limites(): EstadoLimites {
    return { ...this.estadoLimites };
  }

  peticion<T>(peticion: Peticion): Promise<T> {
    return this.semaforo.ejecutar(() => this.conReintentos<T>(peticion));
  }

  private async conReintentos<T>(peticion: Peticion): Promise<T> {
    const idempotente = !["POST", "PATCH"].includes(peticion.metodo);
    for (let intento = 0; ; intento += 1) {
      await this.esperarSiRafagaAgotada();
      try {
        return await this.unaVez<T>(peticion);
      } catch (error) {
        if (!(error instanceof ErrorGhl)) throw error;
        const puede = error.tipo === "limite" || (idempotente && error.reintentable);
        if (!puede || intento >= this.reintentos) throw error;
        const espera = calcularEspera(
          intento,
          { baseMs: this.esperaBaseMs, maximoMs: this.esperaMaximaMs, azar: this.azar },
          error.esperaSugeridaMs,
        );
        this.registrador.registrar("aviso", "ghl.reintento", {
          metodo: peticion.metodo,
          ruta: peticion.ruta,
          tipo: error.tipo,
          intento: intento + 1,
          esperaMs: espera,
        });
        await this.dormir(espera);
        // Ya se esperó por el límite: no se vuelve a esperar la ventana antes del reintento.
        if (error.tipo === "limite") delete this.estadoLimites.restantesRafaga;
      }
    }
  }

  private async esperarSiRafagaAgotada(): Promise<void> {
    const { restantesRafaga, ventanaMs, restantesDia } = this.estadoLimites;
    if (restantesDia === 0) {
      throw new ErrorGhl({ tipo: "limite", detalle: "Se agotó el cupo diario de la subcuenta." });
    }
    if (restantesRafaga === 0 && ventanaMs !== undefined) {
      this.registrador.registrar("aviso", "ghl.rafaga_agotada", { esperaMs: ventanaMs });
      await this.dormir(ventanaMs);
      // La ventana ya pasó: se olvida el conteo hasta que la próxima respuesta lo actualice.
      delete this.estadoLimites.restantesRafaga;
    }
  }

  private async unaVez<T>(peticion: Peticion): Promise<T> {
    const url = construirUrl(this.baseUrl, peticion.ruta, peticion.query);
    const cabeceras: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Version: this.version,
      Accept: "application/json",
    };
    if (peticion.cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";

    const inicio = Date.now();
    let respuesta: Response;
    try {
      respuesta = await this.fetch(url, {
        method: peticion.metodo,
        headers: cabeceras,
        body: peticion.cuerpo === undefined ? null : JSON.stringify(peticion.cuerpo),
        signal: AbortSignal.timeout(this.tiempoLimiteMs),
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.registrador.registrar("error", "ghl.red", {
        metodo: peticion.metodo,
        ruta: peticion.ruta,
      });
      throw new ErrorGhl({ tipo: "red", detalle });
    }

    this.estadoLimites = { ...this.estadoLimites, ...leerLimites(respuesta.headers) };
    let esperaSugeridaMs = esperaRetryAfter(respuesta.headers);
    if (respuesta.status === 429 && esperaSugeridaMs === undefined) {
      const { restantesRafaga, ventanaMs } = this.estadoLimites;
      if (restantesRafaga === 0) esperaSugeridaMs = ventanaMs;
    }

    const texto = await respuesta.text();
    let cuerpo: unknown = undefined;
    if (texto) {
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        cuerpo = texto;
      }
    }
    const traceId =
      cuerpo && typeof cuerpo === "object" && "traceId" in cuerpo
        ? String((cuerpo as { traceId: unknown }).traceId)
        : undefined;

    this.registrador.registrar(respuesta.ok ? "info" : "aviso", "ghl.peticion", {
      metodo: peticion.metodo,
      ruta: peticion.ruta,
      estado: respuesta.status,
      duracionMs: Date.now() - inicio,
      restantesRafaga: this.estadoLimites.restantesRafaga,
      traceId,
    });

    if (!respuesta.ok) {
      const detalle = detalleDeCuerpo(cuerpo);
      let tipo = tipoPorEstado(respuesta.status);
      // GHL responde 401 cuando falta un scope: es un problema de permisos, no del token.
      if (tipo === "autenticacion" && detalle && /scope/i.test(detalle)) tipo = "permiso";
      throw new ErrorGhl({
        tipo,
        estado: respuesta.status,
        ...(detalle === undefined ? {} : { detalle }),
        ...(traceId === undefined ? {} : { traceId }),
        ...(esperaSugeridaMs === undefined ? {} : { esperaSugeridaMs }),
      });
    }
    return cuerpo as T;
  }
}
