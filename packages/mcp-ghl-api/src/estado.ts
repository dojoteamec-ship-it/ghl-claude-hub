import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Entorno } from "@ghl-hub/ghl-core";
import { z } from "zod";

const esquemaActiva = z.object({
  alias: z.string(),
  nombre: z.string(),
  entorno: z.enum(["prueba", "produccion"]),
  actualizada: z.string(),
});
export type Activa = z.infer<typeof esquemaActiva>;

/**
 * Subcuenta activa, guardada en .ghl/activa.json para que la barra de estado la lea. No guarda
 * tokens ni el locationId.
 */
export class EstadoActiva {
  constructor(private readonly ruta: string) {}

  leer(): Activa | undefined {
    try {
      return esquemaActiva.parse(JSON.parse(readFileSync(this.ruta, "utf8")));
    } catch {
      return undefined;
    }
  }

  guardar(datos: { alias: string; nombre: string; entorno: Entorno }): Activa {
    // Solo estos campos: el objeto de la subcuenta trae también el locationId.
    const activa: Activa = {
      alias: datos.alias,
      nombre: datos.nombre,
      entorno: datos.entorno,
      actualizada: new Date().toISOString(),
    };
    mkdirSync(dirname(this.ruta), { recursive: true });
    // Escritura atómica: la barra de estado nunca lee un archivo a medias.
    const temporal = `${this.ruta}.tmp`;
    writeFileSync(temporal, JSON.stringify(activa, null, 2) + "\n");
    renameSync(temporal, this.ruta);
    return activa;
  }
}
