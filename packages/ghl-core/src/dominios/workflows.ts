import { z } from "zod";
import { type ContextoOperacion, definirEscritura, definirLectura } from "../operacion.js";
import { leerContacto } from "./contactos.js";
import { ErrorGhl } from "../errores.js";
import { campo, enc, id, lista, sinVacios, texto } from "./comun.js";

export interface Workflow {
  id: string;
  nombre: string | undefined;
  estado: string | undefined;
}

async function workflowsDeSubcuenta(ctx: ContextoOperacion): Promise<Workflow[]> {
  const respuesta = await ctx.cliente.peticion<unknown>({
    metodo: "GET",
    ruta: "/workflows/",
    query: { locationId: ctx.subcuenta.locationId },
  });
  return lista(campo(respuesta, "workflows")).map((w) => ({
    id: String(campo(w, "id") ?? ""),
    nombre: texto(campo(w, "name")),
    estado: texto(campo(w, "status")),
  }));
}

/** El workflow debe existir en la subcuenta; así no se inscribe a nadie en uno ajeno. */
async function exigirWorkflow(ctx: ContextoOperacion, workflowId: string) {
  const workflows = await workflowsDeSubcuenta(ctx);
  if (!workflows.some((w) => w.id === workflowId)) {
    throw new ErrorGhl({
      tipo: "no_encontrado",
      detalle: "El workflow no existe en esta subcuenta.",
    });
  }
}

export const listarWorkflows = definirLectura({
  nombre: "listarWorkflows",
  descripcion: "Lista los workflows de la subcuenta con su estado (publicado o borrador).",
  entrada: z.object({}),
  ejecutar: async (ctx) => ({ workflows: await workflowsDeSubcuenta(ctx) }),
});

const entradaWorkflow = z.object({
  contactId: id("ID del contacto."),
  workflowId: id("ID del workflow."),
});

export const inscribirEnWorkflow = definirEscritura({
  nombre: "inscribirEnWorkflow",
  tipo: "sensible",
  descripcion:
    "Inscribe un contacto en un workflow. Es sensible: el workflow puede enviar mensajes o cobrar.",
  entrada: entradaWorkflow.extend({
    inicio: z.iso.datetime({ offset: true }).optional().describe("Inicio del evento, ISO 8601."),
  }),
  async preparar(ctx, e) {
    await leerContacto(ctx, e.contactId);
    await exigirWorkflow(ctx, e.workflowId);
    return {
      metodo: "POST",
      ruta: `/contacts/${enc(e.contactId)}/workflow/${enc(e.workflowId)}`,
      cuerpo: sinVacios({ eventStartTime: e.inicio }),
    };
  },
  interpretar: (respuesta) => ({ ok: campo(respuesta, "succeeded") === true }),
});

export const sacarDeWorkflow = definirEscritura({
  nombre: "sacarDeWorkflow",
  tipo: "escritura",
  descripcion: "Saca un contacto de un workflow.",
  entrada: entradaWorkflow,
  async preparar(ctx, e) {
    await leerContacto(ctx, e.contactId);
    await exigirWorkflow(ctx, e.workflowId);
    return {
      metodo: "DELETE",
      ruta: `/contacts/${enc(e.contactId)}/workflow/${enc(e.workflowId)}`,
      cuerpo: {},
    };
  },
  interpretar: (respuesta) => ({ ok: campo(respuesta, "succeeded") === true }),
});

export const operacionesWorkflows = [listarWorkflows, inscribirEnWorkflow, sacarDeWorkflow];
