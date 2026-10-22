import { type ClienteGhl, ErrorGhl, buscarOperacion, ejecutarOperacion } from "@ghl-hub/ghl-core";
import type { Almacen, SubcuentaBot, UsuarioBot } from "./almacen/tipos.js";
import { aSubcuentaCore } from "./proveedor.js";

export interface ResultadoConfirmacion {
  ok: boolean;
  mensaje: string;
}

/** Solo nombres de campos y tipos: la auditoría no guarda datos personales. */
export const resumirParametros = (entrada: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(entrada).map(([k, v]) => [
      k,
      Array.isArray(v) ? `lista(${v.length})` : typeof v,
    ]),
  );

async function puedeUsar(almacen: Almacen, usuario: UsuarioBot, subcuenta: SubcuentaBot) {
  if (!subcuenta.activa) return false;
  if (usuario.rol === "cliente") return usuario.subcuentaId === subcuenta.id;
  return (await almacen.accesosAdmin(usuario.id)).includes(subcuenta.id);
}

/**
 * Ejecuta una acción pendiente cuando su dueño toca Confirmar. Comprueba dueño, chat, vencimiento
 * y acceso; la toma de forma atómica para que dos toques no la ejecuten dos veces.
 */
export async function confirmarAccion(
  dependencias: { almacen: Almacen; clientePara: (s: SubcuentaBot) => Promise<ClienteGhl> },
  datos: { id: string; usuario: UsuarioBot; chatId: number; ahora?: Date },
): Promise<ResultadoConfirmacion> {
  const { almacen } = dependencias;
  const accion = await almacen.pendiente(datos.id);
  if (!accion || accion.usuarioId !== datos.usuario.id || accion.chatId !== datos.chatId) {
    return { ok: false, mensaje: "No encontré esa acción." };
  }
  if (accion.estado !== "pendiente")
    return { ok: false, mensaje: "Esa acción ya no está pendiente." };
  if (accion.vence.getTime() <= (datos.ahora ?? new Date()).getTime()) {
    await almacen.resolverPendiente(accion.id, "vencida");
    return {
      ok: false,
      mensaje: "La acción venció (10 minutos). Pídela de nuevo si todavía la necesitas.",
    };
  }
  const subcuenta = await almacen.subcuentaPorId(accion.subcuentaId);
  if (!subcuenta || !(await puedeUsar(almacen, datos.usuario, subcuenta))) {
    await almacen.resolverPendiente(accion.id, "cancelada");
    return { ok: false, mensaje: "Ya no tienes acceso a esa subcuenta." };
  }
  const operacion = buscarOperacion(accion.operacion);
  if (!operacion || operacion.tipo === "lectura")
    return { ok: false, mensaje: "Acción desconocida." };

  const entrada = accion.entrada;
  if (!(await almacen.resolverPendiente(accion.id, "ejecutada"))) {
    return { ok: false, mensaje: "Esa acción ya se procesó." };
  }
  const registro = {
    usuarioId: datos.usuario.id,
    telegramId: datos.usuario.telegramId,
    subcuentaId: subcuenta.id,
    accion: accion.operacion,
    tipo: operacion.tipo,
    parametros: resumirParametros(entrada),
  };
  try {
    await ejecutarOperacion(
      operacion,
      {
        cliente: await dependencias.clientePara(subcuenta),
        subcuenta: aSubcuentaCore(subcuenta),
        confirmacionHumana: true,
      },
      entrada,
    );
    await almacen.auditar({ ...registro, resultado: "ok" });
    return { ok: true, mensaje: `Hecho en "${subcuenta.alias}".` };
  } catch (error) {
    await almacen.marcarFallida(accion.id);
    const mensaje = error instanceof ErrorGhl ? error.message : "Error inesperado.";
    await almacen.auditar({
      ...registro,
      resultado: `error: ${error instanceof ErrorGhl ? error.tipo : "desconocido"}`,
    });
    return { ok: false, mensaje: `No se pudo completar: ${mensaje}` };
  }
}

export async function cancelarAccion(
  almacen: Almacen,
  datos: { id: string; usuario: UsuarioBot; chatId: number },
): Promise<ResultadoConfirmacion> {
  const accion = await almacen.pendiente(datos.id);
  if (!accion || accion.usuarioId !== datos.usuario.id || accion.chatId !== datos.chatId) {
    return { ok: false, mensaje: "No encontré esa acción." };
  }
  const ok = await almacen.resolverPendiente(accion.id, "cancelada");
  if (ok) {
    await almacen.auditar({
      usuarioId: datos.usuario.id,
      telegramId: datos.usuario.telegramId,
      subcuentaId: accion.subcuentaId,
      accion: accion.operacion,
      resultado: "cancelada",
    });
  }
  return ok
    ? { ok: true, mensaje: "Cancelada. No se hizo nada." }
    : { ok: false, mensaje: "Esa acción ya no está pendiente." };
}
