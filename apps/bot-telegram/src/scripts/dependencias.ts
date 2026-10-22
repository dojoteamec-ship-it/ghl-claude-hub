import { AlmacenSupabase } from "../almacen/supabase.js";
import { claveDesdeBase64 } from "../cifrado.js";
import { cargarVariables } from "../config.js";
import { salir } from "./terminal.js";

/** Almacén y clave para los scripts de alta, desde .env.local. */
export function dependenciasDeAlta() {
  const v = cargarVariables();
  if (!v.SUPABASE_URL || !v.SUPABASE_SERVICE_ROLE_KEY)
    salir("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Corre pnpm bot:configurar.");
  if (!v.BOT_ENCRYPTION_KEY) salir("Falta BOT_ENCRYPTION_KEY. Corre pnpm bot:configurar.");
  return {
    almacen: new AlmacenSupabase(v.SUPABASE_URL, v.SUPABASE_SERVICE_ROLE_KEY),
    clave: claveDesdeBase64(v.BOT_ENCRYPTION_KEY),
  };
}
