#!/usr/bin/env node
// Alta de una subcuenta: pide los datos, valida el PIT contra GHL y escribe
// config/subcuentas.json y .env.local. El PIT se escribe sin mostrarse en pantalla.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const raiz = new URL("..", import.meta.url).pathname;
const rutaSubcuentas = join(raiz, "config", "subcuentas.json");
const rutaEnv = join(raiz, ".env.local");

// En una terminal real se usa el modo terminal para poder ocultar el token; con entrada
// canalizada no hay eco, así que no hace falta.
const esTerminal = Boolean(stdin.isTTY);
const rl = createInterface({ input: stdin, output: stdout, terminal: esTerminal });
const lineas = rl[Symbol.asyncIterator]();
let oculto = false;
const escribirOriginal = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (texto) => {
  if (!oculto && escribirOriginal) escribirOriginal(texto);
};

async function leerLinea(texto, { ocultar = false } = {}) {
  stdout.write(texto);
  oculto = ocultar;
  const { value } = await lineas.next();
  oculto = false;
  if (ocultar || !esTerminal) stdout.write("\n");
  return String(value ?? "").trim();
}
const preguntar = (texto) => leerLinea(texto);
const preguntarOculto = (texto) => leerLinea(texto, { ocultar: true });

const salir = (mensaje) => {
  console.error(mensaje);
  rl.close();
  process.exit(1);
};

const alias = (await preguntar("Alias (minúsculas, por ejemplo prueba o tomas): ")).toLowerCase();
if (!/^[a-z0-9][a-z0-9_]*$/.test(alias))
  salir("El alias solo admite minúsculas, números y guion bajo.");
const locationId = await preguntar(
  "Location ID de la subcuenta (está en la URL de GHL, después de /location/): ",
);
if (!/^[A-Za-z0-9]{10,40}$/.test(locationId))
  salir("Ese Location ID no tiene el formato esperado.");
const entornoRespuesta = (await preguntar("¿Es la subcuenta de prueba? (s/n): ")).toLowerCase();
const entorno = entornoRespuesta.startsWith("s") ? "prueba" : "produccion";
const pit = await preguntarOculto("Pega el Private Integration Token (no se verá en pantalla): ");
if (!pit.startsWith("pit-")) salir("El token debe empezar con pit-.");

stdout.write("Validando con GHL... ");
const respuesta = await fetch(
  `https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`,
  {
    headers: { Authorization: `Bearer ${pit}`, Version: "v3", Accept: "application/json" },
  },
).catch(() => undefined);
if (!respuesta?.ok) {
  salir(
    `\nGHL no aceptó el token para esa subcuenta (estado ${respuesta?.status ?? "sin conexión"}). Revisa el token, el Location ID y que el token tenga el scope locations.readonly.`,
  );
}
const { location } = await respuesta.json();
const nombre = location?.name ?? alias;
console.log(`ok: "${nombre}".`);

const archivo = existsSync(rutaSubcuentas)
  ? JSON.parse(readFileSync(rutaSubcuentas, "utf8"))
  : { subcuentas: [] };
archivo.subcuentas = archivo.subcuentas.filter((s) => s.alias !== alias);
archivo.subcuentas.push({ alias, nombre, locationId, entorno, notas: "" });
writeFileSync(rutaSubcuentas, JSON.stringify(archivo, null, 2) + "\n");

const variable = `GHL_PIT_${alias.toUpperCase()}`;
const lineasEnv = existsSync(rutaEnv) ? readFileSync(rutaEnv, "utf8").split("\n") : [];
const sinVariable = lineasEnv.filter((l) => !l.startsWith(`${variable}=`) && l !== "");
writeFileSync(rutaEnv, [...sinVariable, `${variable}=${pit}`].join("\n") + "\n", { mode: 0o600 });

console.log(
  `Listo: "${alias}" (${entorno}) en config/subcuentas.json y ${variable} en .env.local.`,
);
rl.close();
