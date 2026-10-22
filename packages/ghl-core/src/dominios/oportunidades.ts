import { z } from "zod";
import { type ContextoOperacion, definirEscritura, definirLectura } from "../operacion.js";
import { campo, enc, exigirMismaSubcuenta, id, lista, numero, sinVacios, texto } from "./comun.js";

const estados = ["open", "won", "lost", "abandoned"] as const;

/** Oportunidad proyectada, sin los datos del contacto embebido (email, teléfono). */
export interface Oportunidad {
  id: string;
  nombre: string | undefined;
  valor: number | undefined;
  estado: string | undefined;
  pipelineId: string | undefined;
  etapaId: string | undefined;
  contactId: string | undefined;
  asignadaA: string | undefined;
  origen: string | undefined;
  creada: string | undefined;
  actualizada: string | undefined;
  ultimoCambioEtapa: string | undefined;
  ultimoCambioEstado: string | undefined;
}

export function proyectarOportunidad(crudo: unknown): Oportunidad {
  return {
    id: String(campo(crudo, "id") ?? ""),
    nombre: texto(campo(crudo, "name")),
    valor: numero(campo(crudo, "monetaryValue")),
    estado: texto(campo(crudo, "status")),
    pipelineId: texto(campo(crudo, "pipelineId")),
    etapaId: texto(campo(crudo, "pipelineStageId")),
    contactId: texto(campo(crudo, "contactId")),
    asignadaA: texto(campo(crudo, "assignedTo")),
    origen: texto(campo(crudo, "source")),
    creada: texto(campo(crudo, "createdAt")),
    actualizada: texto(campo(crudo, "updatedAt")),
    ultimoCambioEtapa: texto(campo(crudo, "lastStageChangeAt")),
    ultimoCambioEstado: texto(campo(crudo, "lastStatusChangeAt")),
  };
}

export interface Pipeline {
  id: string;
  nombre: string | undefined;
  etapas: { id: string; nombre: string | undefined; posicion: number | undefined }[];
}

const idOportunidad = id("ID de la oportunidad.");

async function leerOportunidad(ctx: ContextoOperacion, oportunidadId: string) {
  const respuesta = await ctx.cliente.peticion<unknown>({
    metodo: "GET",
    ruta: `/opportunities/${enc(oportunidadId)}`,
  });
  const crudo = campo(respuesta, "opportunity");
  exigirMismaSubcuenta(ctx, crudo, "La oportunidad");
  return proyectarOportunidad(crudo);
}

export const listarPipelines = definirLectura({
  nombre: "listarPipelines",
  descripcion: "Lista los pipelines de la subcuenta con sus etapas.",
  entrada: z.object({}),
  async ejecutar(ctx): Promise<{ pipelines: Pipeline[] }> {
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: "/opportunities/pipelines",
      query: { locationId: ctx.subcuenta.locationId },
    });
    return {
      pipelines: lista(campo(respuesta, "pipelines")).map((p) => ({
        id: String(campo(p, "id") ?? ""),
        nombre: texto(campo(p, "name")),
        etapas: lista(campo(p, "stages")).map((e) => ({
          id: String(campo(e, "id") ?? ""),
          nombre: texto(campo(e, "name")),
          posicion: numero(campo(e, "position")),
        })),
      })),
    };
  },
});

const filtrosOportunidades = {
  texto: z.string().max(75).optional().describe("Texto libre."),
  estado: z.enum([...estados, "all"]).default("open"),
  pipelineId: z.string().optional(),
  etapaId: z.string().optional(),
  contactId: z.string().optional(),
  asignadaA: z.string().optional().describe("ID del usuario."),
};

async function paginaOportunidades(
  ctx: ContextoOperacion,
  e: z.output<z.ZodObject<typeof filtrosOportunidades>>,
  limite: number,
  cursor?: { startAfter: string; startAfterId: string },
) {
  const respuesta = await ctx.cliente.peticion<unknown>({
    metodo: "GET",
    ruta: "/opportunities/search",
    query: {
      locationId: ctx.subcuenta.locationId,
      q: e.texto,
      status: e.estado,
      pipelineId: e.pipelineId,
      pipelineStageId: e.etapaId,
      contactId: e.contactId,
      assignedTo: e.asignadaA,
      limit: limite,
      startAfter: cursor?.startAfter,
      startAfterId: cursor?.startAfterId,
    },
  });
  const meta = campo(respuesta, "meta");
  const startAfter = campo(meta, "startAfter");
  const startAfterId = texto(campo(meta, "startAfterId"));
  return {
    oportunidades: lista(campo(respuesta, "opportunities")).map(proyectarOportunidad),
    total: Number(campo(meta, "total") ?? 0),
    siguiente:
      startAfter !== undefined && startAfter !== null && startAfterId
        ? { startAfter: String(startAfter), startAfterId }
        : undefined,
  };
}

export const buscarOportunidades = definirLectura({
  nombre: "buscarOportunidades",
  descripcion:
    "Busca oportunidades por estado, pipeline, etapa, contacto o responsable. Con todas: true " +
    "recorre las páginas hasta el máximo indicado.",
  entrada: z.object({
    ...filtrosOportunidades,
    limite: z.number().int().min(1).max(100).default(20),
    todas: z.boolean().default(false),
    maximo: z.number().int().min(1).max(5000).default(1000),
  }),
  async ejecutar(ctx, e) {
    const primera = await paginaOportunidades(ctx, e, e.todas ? 100 : e.limite);
    const oportunidades = [...primera.oportunidades];
    let siguiente = primera.siguiente;
    while (e.todas && siguiente && oportunidades.length < Math.min(e.maximo, primera.total)) {
      const pagina = await paginaOportunidades(ctx, e, 100, siguiente);
      if (pagina.oportunidades.length === 0) break;
      oportunidades.push(...pagina.oportunidades);
      siguiente = pagina.siguiente;
    }
    return {
      oportunidades: oportunidades.slice(0, e.todas ? e.maximo : e.limite),
      total: primera.total,
    };
  },
});

export const oportunidadesSinMovimiento = definirLectura({
  nombre: "oportunidadesSinMovimiento",
  descripcion:
    "Oportunidades abiertas cuyo último cambio de etapa es anterior a N días. GHL no tiene este " +
    "filtro: se traen todas las abiertas y se filtran aquí.",
  entrada: z.object({
    dias: z.number().int().min(1).max(365).default(14),
    pipelineId: z.string().optional(),
  }),
  async ejecutar(ctx, e) {
    const limiteMs = Date.now() - e.dias * 86_400_000;
    const { oportunidades } = (await buscarOportunidades.ejecutar(ctx, {
      ...buscarOportunidades.entrada.parse({ pipelineId: e.pipelineId, todas: true }),
    })) as { oportunidades: Oportunidad[] };
    return {
      oportunidades: oportunidades.filter((o) => {
        const ultimo = o.ultimoCambioEtapa ?? o.actualizada ?? o.creada;
        return ultimo !== undefined && Date.parse(ultimo) < limiteMs;
      }),
    };
  },
});

export const obtenerOportunidad = definirLectura({
  nombre: "obtenerOportunidad",
  descripcion: "Lee una oportunidad por ID.",
  entrada: z.object({ oportunidadId: idOportunidad }),
  ejecutar: (ctx, e) => leerOportunidad(ctx, e.oportunidadId),
});

const oportunidadDeRespuesta = (respuesta: unknown) =>
  proyectarOportunidad(campo(respuesta, "opportunity"));

export const crearOportunidad = definirEscritura({
  nombre: "crearOportunidad",
  tipo: "escritura",
  descripcion: "Crea una oportunidad para un contacto en un pipeline.",
  entrada: z.object({
    pipelineId: id("ID del pipeline."),
    etapaId: z.string().optional().describe("ID de la etapa; por defecto la primera."),
    nombre: z.string().min(1),
    contactId: id("ID del contacto."),
    estado: z.enum(estados).default("open"),
    valor: z.number().nonnegative().optional(),
    asignadaA: z.string().optional(),
  }),
  preparar: (ctx, e) =>
    Promise.resolve({
      metodo: "POST",
      ruta: "/opportunities/",
      cuerpo: sinVacios({
        locationId: ctx.subcuenta.locationId,
        pipelineId: e.pipelineId,
        pipelineStageId: e.etapaId,
        name: e.nombre,
        contactId: e.contactId,
        status: e.estado,
        monetaryValue: e.valor,
        assignedTo: e.asignadaA,
      }),
    }),
  interpretar: oportunidadDeRespuesta,
});

export const actualizarOportunidad = definirEscritura({
  nombre: "actualizarOportunidad",
  tipo: "escritura",
  descripcion: "Actualiza nombre, valor, responsable, pipeline o etapa de una oportunidad.",
  entrada: z.object({
    oportunidadId: idOportunidad,
    nombre: z.string().optional(),
    valor: z.number().nonnegative().optional(),
    asignadaA: z.string().optional(),
    pipelineId: z.string().optional(),
    etapaId: z.string().optional(),
  }),
  async preparar(ctx, e) {
    await leerOportunidad(ctx, e.oportunidadId);
    return {
      metodo: "PUT",
      ruta: `/opportunities/${enc(e.oportunidadId)}`,
      cuerpo: sinVacios({
        name: e.nombre,
        monetaryValue: e.valor,
        assignedTo: e.asignadaA,
        pipelineId: e.pipelineId,
        pipelineStageId: e.etapaId,
      }),
    };
  },
  interpretar: oportunidadDeRespuesta,
});

export const moverEtapa = definirEscritura({
  nombre: "moverEtapa",
  tipo: "escritura",
  descripcion: "Mueve una oportunidad a otra etapa del mismo pipeline.",
  entrada: z.object({ oportunidadId: idOportunidad, etapaId: id("ID de la etapa destino.") }),
  async preparar(ctx, e) {
    const actual = await leerOportunidad(ctx, e.oportunidadId);
    return {
      metodo: "PUT",
      ruta: `/opportunities/${enc(e.oportunidadId)}`,
      cuerpo: sinVacios({ pipelineId: actual.pipelineId, pipelineStageId: e.etapaId }),
    };
  },
  interpretar: oportunidadDeRespuesta,
});

export const cambiarEstadoOportunidad = definirEscritura({
  nombre: "cambiarEstadoOportunidad",
  tipo: "escritura",
  descripcion: "Cambia el estado de una oportunidad: abierta, ganada, perdida o abandonada.",
  entrada: z.object({
    oportunidadId: idOportunidad,
    estado: z.enum(estados),
    motivoPerdidaId: z.string().optional().describe("ID del motivo, si se marca como perdida."),
  }),
  async preparar(ctx, e) {
    await leerOportunidad(ctx, e.oportunidadId);
    return {
      metodo: "PUT",
      ruta: `/opportunities/${enc(e.oportunidadId)}/status`,
      cuerpo: sinVacios({ status: e.estado, lostReasonId: e.motivoPerdidaId }),
    };
  },
  interpretar: (respuesta) => ({ ok: campo(respuesta, "success") === true }),
});

export const borrarOportunidad = definirEscritura({
  nombre: "borrarOportunidad",
  tipo: "destructiva",
  descripcion: "Borra una oportunidad. No se puede deshacer.",
  entrada: z.object({ oportunidadId: idOportunidad }),
  async preparar(ctx, e) {
    await leerOportunidad(ctx, e.oportunidadId);
    return { metodo: "DELETE", ruta: `/opportunities/${enc(e.oportunidadId)}` };
  },
  interpretar: (respuesta) => ({ borrada: campo(respuesta, "success") === true }),
});

export const operacionesOportunidades = [
  listarPipelines,
  buscarOportunidades,
  oportunidadesSinMovimiento,
  obtenerOportunidad,
  crearOportunidad,
  actualizarOportunidad,
  moverEtapa,
  cambiarEstadoOportunidad,
  borrarOportunidad,
];
