import type { Almacen, SubcuentaBot, UsuarioBot } from "./almacen/tipos.js";
import { fechaLocal } from "./fechas.js";
import type { Consumo, ModeloBot } from "./modelos.js";

export interface EstadoTopes {
  permitido: boolean;
  motivo?: string;
}

/** Antes de llamar al modelo: el uso del día no puede pasar los topes de la subcuenta y del usuario. */
export async function revisarTopes(
  almacen: Almacen,
  subcuenta: SubcuentaBot,
  usuario: UsuarioBot,
  ahora = new Date(),
): Promise<EstadoTopes> {
  const fecha = fechaLocal(ahora);
  const [deSubcuenta, deUsuario] = await Promise.all([
    almacen.usoDelDia(fecha, { subcuentaId: subcuenta.id }),
    almacen.usoDelDia(fecha, { usuarioId: usuario.id }),
  ]);
  if (deSubcuenta.costoUsd >= subcuenta.topeDiarioUsd) {
    return {
      permitido: false,
      motivo: `La subcuenta "${subcuenta.alias}" llegó a su tope diario de US$ ${subcuenta.topeDiarioUsd.toFixed(2)}.`,
    };
  }
  if (deUsuario.costoUsd >= usuario.topeDiarioUsd) {
    return {
      permitido: false,
      motivo: `Llegaste a tu tope diario de US$ ${usuario.topeDiarioUsd.toFixed(2)}.`,
    };
  }
  return { permitido: true };
}

/**
 * Registra el consumo de un turno en uso_diario y devuelve los avisos para el admin cuando la
 * subcuenta o el usuario cruzan el 80 % de su tope (una vez por día).
 */
export async function registrarConsumo(
  almacen: Almacen,
  datos: {
    subcuenta: SubcuentaBot;
    usuario: UsuarioBot;
    consumoPorModelo: Partial<Record<ModeloBot, Consumo>>;
    ahora?: Date;
  },
): Promise<string[]> {
  const fecha = fechaLocal(datos.ahora);
  for (const [modelo, consumo] of Object.entries(datos.consumoPorModelo) as [
    ModeloBot,
    Consumo,
  ][]) {
    await almacen.registrarUso(fecha, datos.subcuenta.id, datos.usuario.id, modelo, consumo);
  }
  const avisos: string[] = [];
  const deSubcuenta = await almacen.usoDelDia(fecha, { subcuentaId: datos.subcuenta.id });
  if (
    deSubcuenta.costoUsd >= 0.8 * datos.subcuenta.topeDiarioUsd &&
    (await almacen.marcarAviso(fecha, `subcuenta:${datos.subcuenta.id}`))
  ) {
    avisos.push(
      `Aviso: "${datos.subcuenta.alias}" va en US$ ${deSubcuenta.costoUsd.toFixed(2)} de US$ ${datos.subcuenta.topeDiarioUsd.toFixed(2)} hoy (80 %).`,
    );
  }
  const deUsuario = await almacen.usoDelDia(fecha, { usuarioId: datos.usuario.id });
  if (
    deUsuario.costoUsd >= 0.8 * datos.usuario.topeDiarioUsd &&
    (await almacen.marcarAviso(fecha, `usuario:${datos.usuario.id}`))
  ) {
    avisos.push(
      `Aviso: ${datos.usuario.nombre} va en US$ ${deUsuario.costoUsd.toFixed(2)} de US$ ${datos.usuario.topeDiarioUsd.toFixed(2)} hoy (80 %).`,
    );
  }
  return avisos;
}
