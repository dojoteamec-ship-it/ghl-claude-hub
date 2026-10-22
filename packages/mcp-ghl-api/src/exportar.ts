import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import writeExcelFile from "write-excel-file/node";

type Celda = string | number | boolean | null;

/** Busca la lista principal de un resultado: él mismo si es arreglo, o su primer arreglo de objetos. */
export function filasDe(resultado: unknown): Record<string, unknown>[] {
  if (Array.isArray(resultado))
    return resultado.filter(
      (f): f is Record<string, unknown> => typeof f === "object" && f !== null,
    );
  if (resultado && typeof resultado === "object") {
    for (const valor of Object.values(resultado)) {
      if (Array.isArray(valor) && valor.some((v) => typeof v === "object" && v !== null))
        return filasDe(valor);
    }
    return [resultado as Record<string, unknown>];
  }
  return [];
}

/** Aplana objetos anidados con claves "a.b"; las listas de textos se unen con comas. */
function aplanar(objeto: Record<string, unknown>, prefijo = ""): Record<string, Celda> {
  const plano: Record<string, Celda> = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    const nombre = prefijo ? `${prefijo}.${clave}` : clave;
    if (valor === undefined || valor === null) plano[nombre] = null;
    else if (Array.isArray(valor)) {
      plano[nombre] = valor.every((v) => typeof v !== "object")
        ? valor.join(", ")
        : JSON.stringify(valor);
    } else if (typeof valor === "object")
      Object.assign(plano, aplanar(valor as Record<string, unknown>, nombre));
    else plano[nombre] = valor as Celda;
  }
  return plano;
}

export function tabla(resultado: unknown): { columnas: string[]; filas: Celda[][] } {
  const planas = filasDe(resultado).map((f) => aplanar(f));
  const columnas = [...new Set(planas.flatMap((f) => Object.keys(f)))];
  return { columnas, filas: planas.map((f) => columnas.map((c) => f[c] ?? null)) };
}

const celdaCsv = (valor: Celda) => {
  if (valor === null) return "";
  const texto = String(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
};

/** CSV en UTF-8 con BOM para que Excel muestre bien tildes y eñes. */
export function aCsv({ columnas, filas }: ReturnType<typeof tabla>): string {
  return "﻿" + [columnas, ...filas].map((f) => f.map(celdaCsv).join(",")).join("\r\n") + "\r\n";
}

export async function escribirExportacion(opciones: {
  carpeta: string;
  nombre: string;
  alias: string;
  formato: "csv" | "xlsx";
  resultado: unknown;
  ahora?: Date;
}): Promise<{ ruta: string; filas: number; columnas: number }> {
  const datos = tabla(opciones.resultado);
  const sello = (opciones.ahora ?? new Date())
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  const base = `${opciones.nombre}-${opciones.alias}-${sello}`.replace(/[^A-Za-z0-9_.-]+/g, "-");
  mkdirSync(opciones.carpeta, { recursive: true });
  const ruta = join(opciones.carpeta, `${base}.${opciones.formato}`);
  if (opciones.formato === "csv") {
    writeFileSync(ruta, aCsv(datos));
  } else {
    const encabezado = datos.columnas.map((c) => ({ value: c, fontWeight: "bold" as const }));
    await writeExcelFile([encabezado, ...datos.filas]).toFile(ruta);
  }
  return { ruta, filas: datos.filas.length, columnas: datos.columnas.length };
}
