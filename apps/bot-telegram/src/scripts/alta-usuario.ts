// pnpm bot:usuario:alta: registra a alguien en el bot como admin o como cliente de una subcuenta.
import { dependenciasDeAlta } from "./dependencias.js";
import { crearTerminal, salir } from "./terminal.js";

const { almacen } = dependenciasDeAlta();
const t = crearTerminal();
const telegramId = Number(await t.preguntar("ID numérico de Telegram de la persona: "));
if (!Number.isInteger(telegramId) || telegramId <= 0) salir("El ID debe ser un número.");
const nombre = await t.preguntar("Nombre: ");
const rol = (await t.preguntar("Rol (admin o cliente): ")).toLowerCase();
if (rol !== "admin" && rol !== "cliente") salir("El rol debe ser admin o cliente.");
const subcuentas = await almacen.subcuentas();
let subcuentaId: string | null = null;
if (rol === "cliente") {
  console.log(
    `Subcuentas: ${subcuentas.map((s) => s.alias).join(", ") || "(ninguna; corre antes pnpm bot:subcuenta:alta)"}`,
  );
  const alias = await t.preguntar("Alias de su subcuenta: ");
  subcuentaId =
    subcuentas.find((s) => s.alias === alias)?.id ?? salir(`No existe la subcuenta "${alias}".`);
}
const tope = Number(
  (await t.preguntar(`Tope diario de costo en USD (Enter para ${rol === "admin" ? 10 : 2}): `)) ||
    (rol === "admin" ? "10" : "2"),
);
t.cerrar();

const usuario = await almacen.guardarUsuario({
  telegramId,
  nombre: nombre || String(telegramId),
  rol,
  subcuentaId,
  topeDiarioUsd: tope,
  activo: true,
});
if (rol === "admin") for (const s of subcuentas) await almacen.darAccesoAdmin(usuario.id, s.id);
console.log(
  `Listo: ${usuario.nombre} es ${rol}${rol === "admin" ? ` con acceso a ${subcuentas.length} subcuenta(s)` : ""}.`,
);
