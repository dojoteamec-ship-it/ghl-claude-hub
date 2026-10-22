import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ClienteGhl, configuracionApi } from "../cliente.js";
import type { ContextoOperacion } from "../operacion.js";
import { ProveedorSubcuentasLocal } from "../proveedor-local.js";
import type { NivelRegistro, Registrador } from "../registro.js";
import type { Subcuenta } from "../subcuentas.js";

const raiz = (ruta: string) => fileURLToPath(new URL(`../../../../${ruta}`, import.meta.url));

export interface Registro {
  nivel: NivelRegistro;
  evento: string;
  datos?: Record<string, unknown>;
}

/**
 * Contexto de la subcuenta de prueba. Usa config/subcuentas.json y .env.local si existen (la Mac
 * de Santi); si no, GHL_PRIVATE_TOKEN y GHL_LOCATION_ID del entorno (sesiones en la nube).
 * Nunca devuelve una subcuenta de producción.
 */
export async function contextoDePrueba(): Promise<{
  ctx: ContextoOperacion;
  token: string;
  registros: Registro[];
}> {
  let subcuenta: Subcuenta;
  let token: string;
  const rutaSubcuentas = raiz("config/subcuentas.json");
  if (existsSync(rutaSubcuentas)) {
    const proveedor = new ProveedorSubcuentasLocal({ rutaSubcuentas, rutaEnv: raiz(".env.local") });
    subcuenta = await proveedor.obtener("prueba");
    token = await proveedor.obtenerToken("prueba");
  } else {
    const locationId = process.env.GHL_LOCATION_ID;
    token = process.env.GHL_PRIVATE_TOKEN ?? "";
    if (!locationId || !token) {
      throw new Error("Faltan config/subcuentas.json o GHL_PRIVATE_TOKEN y GHL_LOCATION_ID.");
    }
    subcuenta = { alias: "prueba", nombre: "Prueba", locationId, entorno: "prueba", notas: "" };
  }
  if (subcuenta.entorno !== "prueba") {
    throw new Error(`La subcuenta "${subcuenta.alias}" no es de prueba.`);
  }
  const registros: Registro[] = [];
  const registrador: Registrador = {
    registrar: (nivel, evento, datos) =>
      registros.push({ nivel, evento, ...(datos ? { datos } : {}) }),
  };
  return {
    ctx: { cliente: new ClienteGhl({ token, registrador, ...configuracionApi() }), subcuenta },
    token,
    registros,
  };
}

export const hayCredenciales = () =>
  existsSync(raiz("config/subcuentas.json")) ||
  Boolean(process.env.GHL_PRIVATE_TOKEN && process.env.GHL_LOCATION_ID);
