import { operacionesCalendarios } from "./dominios/calendarios.js";
import { operacionesConfiguracion } from "./dominios/configuracion.js";
import { operacionesContactos } from "./dominios/contactos.js";
import { operacionesConversaciones } from "./dominios/conversaciones.js";
import { operacionesFormularios } from "./dominios/formularios.js";
import { operacionesOportunidades } from "./dominios/oportunidades.js";
import { operacionesPagos } from "./dominios/pagos.js";
import { operacionesUsuarios } from "./dominios/usuarios.js";
import { operacionesWorkflows } from "./dominios/workflows.js";
import type { Operacion } from "./operacion.js";

/** Todas las operaciones de ghl-core. El MCP local y el bot se construyen a partir de esta lista. */
export const catalogo: readonly Operacion[] = [
  ...operacionesContactos,
  ...operacionesOportunidades,
  ...operacionesConversaciones,
  ...operacionesCalendarios,
  ...operacionesConfiguracion,
  ...operacionesWorkflows,
  ...operacionesFormularios,
  ...operacionesUsuarios,
  ...operacionesPagos,
] as readonly Operacion[];

export function buscarOperacion(nombre: string): Operacion | undefined {
  return catalogo.find((o) => o.nombre === nombre);
}
