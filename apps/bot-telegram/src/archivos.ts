import writeExcelFile from "write-excel-file/node";

type Celda = string | number | boolean | null;

/** Lista principal de un resultado: él mismo si es arreglo, o su primer arreglo de objetos. */
export function listaPrincipal(resultado: unknown): Record<string, unknown>[] | undefined {
  if (Array.isArray(resultado))
    return resultado.filter(
      (f): f is Record<string, unknown> => typeof f === "object" && f !== null,
    );
  if (resultado && typeof resultado === "object") {
    for (const valor of Object.values(resultado)) {
      if (Array.isArray(valor) && valor.some((v) => typeof v === "object" && v !== null))
        return listaPrincipal(valor);
    }
  }
  return undefined;
}

function aplanar(objeto: Record<string, unknown>, prefijo = ""): Record<string, Celda> {
  const plano: Record<string, Celda> = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    const nombre = prefijo ? `${prefijo}.${clave}` : clave;
    if (valor === undefined || valor === null) plano[nombre] = null;
    else if (Array.isArray(valor))
      plano[nombre] = valor.every((v) => typeof v !== "object")
        ? valor.join(", ")
        : JSON.stringify(valor);
    else if (typeof valor === "object")
      Object.assign(plano, aplanar(valor as Record<string, unknown>, nombre));
    else plano[nombre] = valor as Celda;
  }
  return plano;
}

/** Convierte una lista en un XLSX en memoria. */
export async function aXlsx(filas: Record<string, unknown>[]): Promise<Buffer> {
  const planas = filas.map((f) => aplanar(f));
  const columnas = [...new Set(planas.flatMap((f) => Object.keys(f)))];
  const encabezado = columnas.map((c) => ({ value: c, fontWeight: "bold" as const }));
  return writeExcelFile([
    encabezado,
    ...planas.map((f) => columnas.map((c) => f[c] ?? null)),
  ]).toBuffer();
}
