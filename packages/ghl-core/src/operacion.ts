import { z } from "zod";
import type { ClienteGhl, Peticion } from "./cliente.js";
import { ErrorGhl } from "./errores.js";
import type { Subcuenta } from "./subcuentas.js";

/**
 * Clasificación de cada operación:
 * - lectura: no cambia nada.
 * - escritura: crea o modifica datos.
 * - sensible: envía mensajes o mueve dinero.
 * - destructiva: borra datos.
 */
export type TipoAccion = "lectura" | "escritura" | "sensible" | "destructiva";

export interface ContextoOperacion {
  cliente: ClienteGhl;
  /** El locationId sale siempre de aquí, nunca de la entrada de la operación. */
  subcuenta: Subcuenta;
  /** Debe ser true para escribir en una subcuenta de producción. Lo fija un humano, no el modelo. */
  confirmacionHumana?: boolean;
}

/** Resultado de una operación de escritura con simular: true. */
export interface Simulacion {
  simulado: true;
  operacion: string;
  tipo: Exclude<TipoAccion, "lectura">;
  subcuenta: string;
  peticion: Peticion;
}

interface Base<E extends z.ZodType> {
  nombre: string;
  descripcion: string;
  entrada: E;
}

export interface OperacionLectura<E extends z.ZodType, S> extends Base<E> {
  tipo: "lectura";
  ejecutar(ctx: ContextoOperacion, entrada: z.output<E>): Promise<S>;
}

export interface OperacionEscritura<E extends z.ZodType, S> extends Base<E> {
  tipo: Exclude<TipoAccion, "lectura">;
  /**
   * Arma la petición. Puede leer antes (por ejemplo, verificar por ID), nunca escribir. Recibe la
   * entrada sin el campo simular.
   */
  preparar(ctx: ContextoOperacion, entrada: z.output<E>): Promise<Peticion>;
  /** Convierte la respuesta de GHL en el resultado proyectado. */
  interpretar(respuesta: unknown, entrada: z.output<E>): S;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registro heterogéneo de operaciones
export type Operacion = OperacionLectura<z.ZodType, any> | OperacionEscritura<z.ZodType, any>;

/** Campo que toda operación de escritura acepta. */
export const campoSimular = z
  .boolean()
  .default(false)
  .describe("Si es true, devuelve la petición que se haría sin ejecutarla.");

export function definirLectura<E extends z.ZodType, S>(
  definicion: Omit<OperacionLectura<E, S>, "tipo">,
): OperacionLectura<E, S> {
  return { ...definicion, tipo: "lectura" };
}

export function definirEscritura<E extends z.ZodObject, S>(
  definicion: OperacionEscritura<E, S>,
): OperacionEscritura<z.ZodObject<E["shape"] & { simular: typeof campoSimular }>, S> {
  return {
    ...definicion,
    entrada: definicion.entrada.extend({ simular: campoSimular }),
  } as unknown as OperacionEscritura<z.ZodObject<E["shape"] & { simular: typeof campoSimular }>, S>;
}

function validar<E extends z.ZodType>(esquema: E, entrada: unknown, nombre: string): z.output<E> {
  const resultado = esquema.safeParse(entrada ?? {});
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`)
      .join("; ");
    throw new ErrorGhl({ tipo: "validacion", detalle: `${nombre}: ${problemas}` });
  }
  return resultado.data;
}

/**
 * Única forma de correr una operación: valida la entrada, aplica la regla de producción y el modo
 * simulación, y ejecuta.
 */
export async function ejecutarOperacion<S>(
  operacion: OperacionLectura<z.ZodType, S> | OperacionEscritura<z.ZodType, S>,
  ctx: ContextoOperacion,
  entrada: unknown,
): Promise<S | Simulacion> {
  const datos = validar(operacion.entrada, entrada, operacion.nombre);
  if (operacion.tipo === "lectura") return operacion.ejecutar(ctx, datos);

  const { simular, ...resto } = datos as { simular?: boolean };
  const peticion = await operacion.preparar(ctx, resto);
  if (simular === true) {
    return {
      simulado: true,
      operacion: operacion.nombre,
      tipo: operacion.tipo,
      subcuenta: ctx.subcuenta.alias,
      peticion,
    };
  }
  if (ctx.subcuenta.entorno === "produccion" && ctx.confirmacionHumana !== true) {
    throw new ErrorGhl({
      tipo: "confirmacion_requerida",
      detalle: `${operacion.nombre} en "${ctx.subcuenta.alias}".`,
    });
  }
  const respuesta = await ctx.cliente.peticion<unknown>(peticion);
  return operacion.interpretar(respuesta, resto);
}

export function esSimulacion(valor: unknown): valor is Simulacion {
  return typeof valor === "object" && valor !== null && (valor as Simulacion).simulado === true;
}
