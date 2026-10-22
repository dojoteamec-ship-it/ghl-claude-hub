import { redactarTodo } from "./redaccion.js";

/** Categorías de error normalizadas, independientes del código HTTP exacto de GHL. */
export type TipoErrorGhl =
  | "autenticacion"
  | "permiso"
  | "no_encontrado"
  | "validacion"
  | "limite"
  | "servidor"
  | "red"
  | "configuracion"
  | "confirmacion_requerida";

const MENSAJES: Record<TipoErrorGhl, string> = {
  autenticacion: "GHL rechazó el token. Revisa que el PIT de la subcuenta siga vigente.",
  permiso: "El token no tiene el permiso (scope) que exige esta operación.",
  no_encontrado: "GHL no encontró el recurso pedido.",
  validacion: "GHL rechazó los datos enviados.",
  limite: "Se alcanzó el límite de peticiones de GHL. Intenta de nuevo en unos segundos.",
  servidor: "GHL tuvo un error interno. Intenta de nuevo más tarde.",
  red: "No se pudo conectar con GHL.",
  configuracion: "La configuración de la subcuenta está incompleta.",
  confirmacion_requerida:
    "Esta subcuenta es de producción: la operación necesita confirmación humana explícita.",
};

export interface DatosErrorGhl {
  tipo: TipoErrorGhl;
  estado?: number;
  detalle?: string;
  traceId?: string;
  /** Espera que sugiere GHL antes de reintentar (Retry-After o ventana de ráfaga), en ms. */
  esperaSugeridaMs?: number;
}

/** Error de GHL con mensaje en español, sin secretos ni datos personales. */
export class ErrorGhl extends Error {
  readonly tipo: TipoErrorGhl;
  readonly estado: number | undefined;
  readonly detalle: string | undefined;
  readonly traceId: string | undefined;
  readonly esperaSugeridaMs: number | undefined;

  constructor({ tipo, estado, detalle, traceId, esperaSugeridaMs }: DatosErrorGhl) {
    const limpio = detalle === undefined ? undefined : redactarTodo(detalle).slice(0, 500);
    super(limpio ? `${MENSAJES[tipo]} Detalle: ${limpio}` : MENSAJES[tipo]);
    this.name = "ErrorGhl";
    this.tipo = tipo;
    this.estado = estado;
    this.detalle = limpio;
    this.traceId = traceId;
    this.esperaSugeridaMs = esperaSugeridaMs;
  }

  /** Indica si conviene reintentar la petición que produjo este error. */
  get reintentable(): boolean {
    return this.tipo === "limite" || this.tipo === "servidor" || this.tipo === "red";
  }
}

/** Traduce un estado HTTP de GHL a la categoría de error. */
export function tipoPorEstado(estado: number): TipoErrorGhl {
  if (estado === 401) return "autenticacion";
  if (estado === 403) return "permiso";
  if (estado === 404) return "no_encontrado";
  if (estado === 429) return "limite";
  if (estado >= 500) return "servidor";
  return "validacion";
}

/** Extrae el mensaje legible de un cuerpo de error de GHL (string o string[]). */
export function detalleDeCuerpo(cuerpo: unknown): string | undefined {
  if (typeof cuerpo === "string") return cuerpo || undefined;
  if (cuerpo && typeof cuerpo === "object" && "message" in cuerpo) {
    const { message } = cuerpo as { message: unknown };
    if (Array.isArray(message)) return message.map(String).join("; ");
    if (typeof message === "string") return message;
  }
  return undefined;
}
