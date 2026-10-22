import { z } from "zod";
import { type ContextoOperacion, definirLectura } from "../operacion.js";
import { campo, enc, lista, texto } from "./comun.js";

export interface DatosSubcuenta {
  id: string;
  nombre: string | undefined;
  companyId: string | undefined;
  zonaHoraria: string | undefined;
  pais: string | undefined;
  sitioWeb: string | undefined;
}

/** Lee la location de la subcuenta. Otras operaciones la usan para obtener el companyId. */
export async function leerSubcuenta(ctx: ContextoOperacion): Promise<DatosSubcuenta> {
  const respuesta = await ctx.cliente.peticion<unknown>({
    metodo: "GET",
    ruta: `/locations/${enc(ctx.subcuenta.locationId)}`,
  });
  const crudo = campo(respuesta, "location");
  return {
    id: String(campo(crudo, "id") ?? ""),
    nombre: texto(campo(crudo, "name")),
    companyId: texto(campo(crudo, "companyId")),
    zonaHoraria: texto(campo(crudo, "timezone")),
    pais: texto(campo(crudo, "country")),
    sitioWeb: texto(campo(crudo, "website")),
  };
}

export const obtenerSubcuenta = definirLectura({
  nombre: "obtenerSubcuenta",
  descripcion: "Datos generales de la subcuenta: nombre, zona horaria, país y sitio web.",
  entrada: z.object({}),
  ejecutar: (ctx) => leerSubcuenta(ctx),
});

export const listarCamposPersonalizados = definirLectura({
  nombre: "listarCamposPersonalizados",
  descripcion: "Campos personalizados de contactos u oportunidades.",
  entrada: z.object({ modelo: z.enum(["contact", "opportunity", "all"]).default("all") }),
  async ejecutar(ctx, e) {
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: `/locations/${enc(ctx.subcuenta.locationId)}/customFields`,
      query: { model: e.modelo },
    });
    return {
      campos: lista(campo(respuesta, "customFields")).map((c) => ({
        id: String(campo(c, "id") ?? ""),
        nombre: texto(campo(c, "name")),
        clave: texto(campo(c, "fieldKey")),
        tipoDato: texto(campo(c, "dataType")),
        modelo: texto(campo(c, "model")),
      })),
    };
  },
});

export const listarValoresPersonalizados = definirLectura({
  nombre: "listarValoresPersonalizados",
  descripcion: "Valores personalizados (custom values) de la subcuenta.",
  entrada: z.object({}),
  async ejecutar(ctx) {
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: `/locations/${enc(ctx.subcuenta.locationId)}/customValues`,
    });
    return {
      valores: lista(campo(respuesta, "customValues")).map((c) => ({
        id: String(campo(c, "id") ?? ""),
        nombre: texto(campo(c, "name")),
        clave: texto(campo(c, "fieldKey")),
        valor: texto(campo(c, "value")),
      })),
    };
  },
});

export const listarTags = definirLectura({
  nombre: "listarTags",
  descripcion: "Tags definidos en la subcuenta.",
  entrada: z.object({}),
  async ejecutar(ctx) {
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: `/locations/${enc(ctx.subcuenta.locationId)}/tags`,
    });
    return {
      tags: lista(campo(respuesta, "tags")).map((t) => ({
        id: String(campo(t, "id") ?? ""),
        nombre: texto(campo(t, "name")),
      })),
    };
  },
});

export const operacionesConfiguracion = [
  obtenerSubcuenta,
  listarCamposPersonalizados,
  listarValoresPersonalizados,
  listarTags,
];
