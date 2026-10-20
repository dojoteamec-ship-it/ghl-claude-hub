import { z } from "zod";

/** Entorno de una subcuenta: en "produccion" toda escritura exige confirmación humana. */
export const esquemaEntorno = z.enum(["prueba", "produccion"]);
export type Entorno = z.infer<typeof esquemaEntorno>;

export const esquemaSubcuenta = z.strictObject({
  alias: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_]*$/, "El alias solo admite minúsculas, números y guion bajo."),
  nombre: z.string().min(1),
  locationId: z.string().min(1),
  entorno: esquemaEntorno,
  notas: z.string().default(""),
});
export type Subcuenta = z.infer<typeof esquemaSubcuenta>;

export const esquemaArchivoSubcuentas = z
  .strictObject({ subcuentas: z.array(esquemaSubcuenta).min(1) })
  .refine(({ subcuentas }) => new Set(subcuentas.map((s) => s.alias)).size === subcuentas.length, {
    message: "Hay alias repetidos en el archivo de subcuentas.",
  });

/** Nombre de la variable de entorno que guarda el PIT de un alias: "prueba" -> "GHL_PIT_PRUEBA". */
export function variablePit(alias: string): string {
  return `GHL_PIT_${alias.toUpperCase()}`;
}
