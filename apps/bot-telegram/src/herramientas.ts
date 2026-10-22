import type Anthropic from "@anthropic-ai/sdk";
import { type Operacion, catalogo } from "@ghl-hub/ghl-core";
import { z } from "zod";

/** buscarContactos -> buscar_contactos. */
export const aSnake = (nombre: string) =>
  nombre.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const etiqueta: Record<Operacion["tipo"], string> = {
  lectura: "Lectura.",
  escritura: "Escritura: queda pendiente hasta que el usuario toque Confirmar.",
  sensible:
    "SENSIBLE (llega a personas o mueve dinero): queda pendiente hasta que el usuario confirme.",
  destructiva: "DESTRUCTIVA (no se puede deshacer): queda pendiente hasta que el usuario confirme.",
};

export interface HerramientaBot {
  nombre: string;
  operacion: Operacion;
  definicion: Anthropic.Beta.BetaTool;
}

/**
 * Herramientas del bot, una por operación de ghl-core, en orden fijo para no romper la caché. No
 * exponen locationId ni subcuenta: el código las inyecta según el usuario. Tampoco exponen
 * simular: toda escritura pasa por la confirmación con botones.
 */
export function construirHerramientas(): HerramientaBot[] {
  const herramientas = catalogo.map((operacion): HerramientaBot => {
    const esquema = z.toJSONSchema(operacion.entrada, { io: "input" }) as Record<
      string,
      unknown
    > & {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    delete esquema.$schema;
    if (esquema.properties) delete esquema.properties.simular;
    if (esquema.required) esquema.required = esquema.required.filter((r) => r !== "simular");
    const nombre = aSnake(operacion.nombre);
    return {
      nombre,
      operacion,
      definicion: {
        name: nombre,
        description: `${operacion.descripcion} ${etiqueta[operacion.tipo]}`,
        input_schema: { type: "object", ...esquema } as Anthropic.Beta.BetaTool.InputSchema,
      },
    };
  });
  const ultima = herramientas.at(-1);
  if (ultima) ultima.definicion = { ...ultima.definicion, cache_control: { type: "ephemeral" } };
  return herramientas;
}
