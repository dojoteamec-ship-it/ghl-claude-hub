import type { Almacen, SubcuentaBot, UsuarioBot } from "./almacen/tipos.js";

export type ResultadoAcceso =
  | { ok: true; usuario: UsuarioBot; subcuenta: SubcuentaBot; disponibles: SubcuentaBot[] }
  | { ok: false; motivo: "no_autorizado" | "sin_subcuenta" | "chat_no_privado" };

/**
 * Resuelve quién escribe y en qué subcuenta trabaja, antes de cualquier llamada al modelo.
 * Un cliente siempre queda en su subcuenta, aunque el chat diga otra cosa. Un admin solo puede
 * usar las subcuentas de accesos_admin.
 */
export async function resolverAcceso(
  almacen: Almacen,
  entrada: { telegramId: number; chatId: number; chatPrivado: boolean },
): Promise<ResultadoAcceso> {
  if (!entrada.chatPrivado) return { ok: false, motivo: "chat_no_privado" };
  const usuario = await almacen.usuarioPorTelegram(entrada.telegramId);
  if (!usuario) {
    await almacen.auditar({
      telegramId: entrada.telegramId,
      accion: "acceso",
      resultado: "no_autorizado",
    });
    return { ok: false, motivo: "no_autorizado" };
  }
  const activas = await almacen.subcuentas();

  if (usuario.rol === "cliente") {
    const propia = activas.find((s) => s.id === usuario.subcuentaId);
    return propia
      ? { ok: true, usuario, subcuenta: propia, disponibles: [propia] }
      : { ok: false, motivo: "sin_subcuenta" };
  }

  const permitidas = new Set(await almacen.accesosAdmin(usuario.id));
  const disponibles = activas.filter((s) => permitidas.has(s.id));
  const elegida = await almacen.subcuentaActivaDelChat(entrada.chatId);
  // Sin elección previa se arranca en una de prueba, nunca en un cliente real por accidente.
  const subcuenta =
    disponibles.find((s) => s.id === elegida) ??
    disponibles.find((s) => s.entorno === "prueba") ??
    disponibles[0];
  return subcuenta
    ? { ok: true, usuario, subcuenta, disponibles }
    : { ok: false, motivo: "sin_subcuenta" };
}

/** Cambia la subcuenta activa de un admin, solo a una permitida. */
export async function cambiarSubcuenta(
  almacen: Almacen,
  usuario: UsuarioBot,
  chatId: number,
  subcuentaId: string,
): Promise<SubcuentaBot | undefined> {
  if (usuario.rol !== "admin") return undefined;
  const permitidas = await almacen.accesosAdmin(usuario.id);
  if (!permitidas.includes(subcuentaId)) return undefined;
  const subcuenta = await almacen.subcuentaPorId(subcuentaId);
  if (!subcuenta?.activa) return undefined;
  await almacen.fijarSubcuentaDelChat(chatId, usuario.id, subcuentaId);
  return subcuenta;
}
