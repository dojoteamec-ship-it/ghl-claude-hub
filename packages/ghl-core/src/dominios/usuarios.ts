import { z } from "zod";
import { ErrorGhl } from "../errores.js";
import { definirLectura } from "../operacion.js";
import { leerSubcuenta } from "./configuracion.js";
import { campo, lista, texto } from "./comun.js";

/** Usuario proyectado: sin email ni teléfono. */
export interface Usuario {
  id: string;
  nombre: string | undefined;
  rol: string | undefined;
  tipo: string | undefined;
}

export const listarUsuarios = definirLectura({
  nombre: "listarUsuarios",
  descripcion: "Usuarios del equipo con acceso a la subcuenta.",
  entrada: z.object({ texto: z.string().optional().describe("Buscar por nombre.") }),
  async ejecutar(ctx, e) {
    // /users/search exige companyId, que el MCP oficial no completa; se toma de la location.
    const { companyId } = await leerSubcuenta(ctx);
    if (!companyId) {
      throw new ErrorGhl({ tipo: "configuracion", detalle: "La subcuenta no informa companyId." });
    }
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: "/users/search",
      query: { companyId, locationId: ctx.subcuenta.locationId, query: e.texto, limit: "100" },
    });
    return {
      usuarios: lista(campo(respuesta, "users")).map((u): Usuario => ({
        id: String(campo(u, "id") ?? ""),
        nombre: texto(campo(u, "name")),
        rol: texto(campo(campo(u, "roles"), "role")),
        tipo: texto(campo(campo(u, "roles"), "type")),
      })),
    };
  },
});

export const operacionesUsuarios = [listarUsuarios];
