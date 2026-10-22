import { z } from "zod";
import { ErrorGhl } from "../errores.js";
import type { ContextoOperacion } from "../operacion.js";

/** Codifica un ID para usarlo dentro de una ruta. */
export const enc = (id: string) => encodeURIComponent(id);

export const id = (descripcion: string) => z.string().trim().min(1).describe(descripcion);

/** Lee un campo de un objeto desconocido sin usar any. */
export function campo(objeto: unknown, nombre: string): unknown {
  return objeto && typeof objeto === "object"
    ? (objeto as Record<string, unknown>)[nombre]
    : undefined;
}

export const texto = (valor: unknown): string | undefined =>
  typeof valor === "string" && valor !== "" ? valor : undefined;

export const numero = (valor: unknown): number | undefined =>
  typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;

export const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);

export const textos = (valor: unknown): string[] =>
  lista(valor).filter((v): v is string => typeof v === "string");

/** Quita las claves con undefined para no mandarlas a GHL. */
export function sinVacios<T extends Record<string, unknown>>(objeto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Verifica que un recurso leído por ID pertenece a la subcuenta del contexto. Protege al bot de
 * operar con IDs de otra subcuenta.
 */
export function exigirMismaSubcuenta(ctx: ContextoOperacion, recurso: unknown, que: string): void {
  const locationId = texto(campo(recurso, "locationId"));
  if (locationId !== undefined && locationId !== ctx.subcuenta.locationId) {
    throw new ErrorGhl({ tipo: "no_encontrado", detalle: `${que} no pertenece a esta subcuenta.` });
  }
}

/** Fecha ISO 8601 o milisegundos desde epoch. */
export const fecha = z
  .union([z.iso.datetime({ offset: true }), z.iso.date(), z.number().int().nonnegative()])
  .describe("Fecha ISO 8601 (2026-10-22 o 2026-10-22T15:00:00Z) o milisegundos desde epoch.");

export function aMilisegundos(valor: string | number): number {
  return typeof valor === "number" ? valor : Date.parse(valor);
}

/** YYYY-MM-DD, como piden formularios, encuestas y pagos. */
export function aDia(valor: string | number): string {
  return new Date(aMilisegundos(valor)).toISOString().slice(0, 10);
}
