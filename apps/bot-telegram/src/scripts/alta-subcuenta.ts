// pnpm bot:subcuenta:alta: guarda una subcuenta en Supabase con su PIT cifrado. El PIT se pega
// aquí, en la Mac, y nunca pasa por Telegram.
import { cifrar } from "../cifrado.js";
import { dependenciasDeAlta } from "./dependencias.js";
import { crearTerminal, salir } from "./terminal.js";

const { almacen, clave } = dependenciasDeAlta();
const t = crearTerminal();
const alias = (await t.preguntar("Alias (minúsculas, por ejemplo prueba o tomas): ")).toLowerCase();
if (!/^[a-z0-9][a-z0-9_]*$/.test(alias))
  salir("El alias solo admite minúsculas, números y guion bajo.");
const locationId = await t.preguntar("Location ID (en la URL de GHL, después de /location/): ");
if (!/^[A-Za-z0-9]{10,40}$/.test(locationId))
  salir("Ese Location ID no tiene el formato esperado.");
const entorno = (await t.preguntar("¿Es la subcuenta de prueba? (s/n): "))
  .toLowerCase()
  .startsWith("s")
  ? "prueba"
  : "produccion";
const tope = Number(
  (await t.preguntar("Tope diario de costo del bot en USD (Enter para 5): ")) || "5",
);
if (!Number.isFinite(tope) || tope < 0) salir("El tope debe ser un número.");
const pit = await t.preguntarOculto("Pega el Private Integration Token (no se verá en pantalla): ");
t.cerrar();
if (!pit.startsWith("pit-")) salir("El token debe empezar con pit-.");

const respuesta = await fetch(
  `https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`,
  {
    headers: { Authorization: `Bearer ${pit}`, Version: "v3", Accept: "application/json" },
  },
).catch(() => undefined);
if (!respuesta?.ok)
  salir(
    `GHL no aceptó el token para esa subcuenta (estado ${respuesta?.status ?? "sin conexión"}).`,
  );
const { location } = (await respuesta.json()) as { location?: { name?: string } };
const nombre = location?.name ?? alias;

const subcuenta = await almacen.guardarSubcuenta({
  alias,
  nombre,
  locationId,
  entorno,
  pitCifrado: cifrar(pit, clave),
  topeDiarioUsd: tope,
  activa: true,
});
for (const admin of await almacen.usuariosAdmin())
  await almacen.darAccesoAdmin(admin.id, subcuenta.id);
console.log(
  `Listo: "${alias}" (${nombre}, ${entorno}) guardada con su PIT cifrado. Los admins ya pueden usarla.`,
);
