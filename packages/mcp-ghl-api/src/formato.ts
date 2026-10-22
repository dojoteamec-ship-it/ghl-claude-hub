import { esSimulacion } from "@ghl-hub/ghl-core";

/** Tope de caracteres de una respuesta; el resto se corta con aviso. */
export const MAXIMO_CARACTERES = 20_000;
/** Elementos que se muestran por lista antes de resumir. */
export const MAXIMO_ELEMENTOS = 50;

/** Recorta listas largas y quita claves sin valor para ahorrar contexto. */
function compactar(valor: unknown, profundidad = 0): unknown {
  if (Array.isArray(valor)) {
    const elementos = valor.slice(0, MAXIMO_ELEMENTOS).map((v) => compactar(v, profundidad + 1));
    if (valor.length > MAXIMO_ELEMENTOS) {
      elementos.push(`… y ${valor.length - MAXIMO_ELEMENTOS} más. Usa filtros o paginación.`);
    }
    return elementos;
  }
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor)
        // Las listas vacías se conservan: "citasHoy: []" dice que no hay citas.
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, compactar(v, profundidad + 1)]),
    );
  }
  return valor;
}

export function formatearResultado(
  resultado: unknown,
  subcuenta: { alias: string; entorno: string },
): string {
  const encabezado = esSimulacion(resultado)
    ? `SIMULACIÓN en "${subcuenta.alias}" (${subcuenta.entorno}): no se ejecutó nada en GHL.`
    : `Subcuenta "${subcuenta.alias}" (${subcuenta.entorno}).`;
  const cuerpo = JSON.stringify(compactar(resultado));
  const texto = `${encabezado}\n${cuerpo}`;
  if (texto.length <= MAXIMO_CARACTERES) return texto;
  return `${texto.slice(0, MAXIMO_CARACTERES)}\n… respuesta cortada en ${MAXIMO_CARACTERES} caracteres. Pide menos resultados.`;
}
