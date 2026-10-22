import { z } from "zod";
import { definirLectura } from "../operacion.js";
import { aDia, campo, fecha, lista, texto } from "./comun.js";

/** Envío proyectado. Las respuestas del formulario (others) quedan fuera por traer datos personales. */
export interface Envio {
  id: string;
  contactId: string | undefined;
  formularioId: string | undefined;
  nombre: string | undefined;
  creado: string | undefined;
}

const entradaEnvios = z.object({
  desde: fecha.optional().describe("Inicio del rango; por defecto, hace un mes."),
  hasta: fecha.optional().describe("Fin del rango; por defecto, hoy."),
  pagina: z.number().int().min(1).default(1),
  limite: z.number().int().min(1).max(100).default(20),
});

function definirEnvios(nombre: string, ruta: string, campoId: "formId" | "surveyId", que: string) {
  return definirLectura({
    nombre,
    descripcion: `Envíos de ${que} en un rango de fechas.`,
    entrada: entradaEnvios.extend({ [campoId]: z.string().optional() }),
    async ejecutar(ctx, e) {
      const respuesta = await ctx.cliente.peticion<unknown>({
        metodo: "GET",
        ruta,
        query: {
          locationId: ctx.subcuenta.locationId,
          startAt: e.desde === undefined ? undefined : aDia(e.desde),
          endAt: e.hasta === undefined ? undefined : aDia(e.hasta),
          page: e.pagina,
          limit: e.limite,
          [campoId]: (e as Record<string, unknown>)[campoId] as string | undefined,
        },
      });
      return {
        envios: lista(campo(respuesta, "submissions")).map((s): Envio => ({
          id: String(campo(s, "id") ?? ""),
          contactId: texto(campo(s, "contactId")),
          formularioId: texto(campo(s, campoId)) ?? texto(campo(s, "formId")),
          nombre: texto(campo(s, "name")),
          creado: texto(campo(s, "createdAt")),
        })),
        total: Number(campo(campo(respuesta, "meta"), "total") ?? 0),
      };
    },
  });
}

export const enviosFormularios = definirEnvios(
  "enviosFormularios",
  "/forms/submissions",
  "formId",
  "formularios",
);
export const enviosEncuestas = definirEnvios(
  "enviosEncuestas",
  "/surveys/submissions",
  "surveyId",
  "encuestas",
);

export const operacionesFormularios = [enviosFormularios, enviosEncuestas];
