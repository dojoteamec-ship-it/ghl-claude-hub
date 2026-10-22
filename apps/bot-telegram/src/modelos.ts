import type Anthropic from "@anthropic-ai/sdk";

export const HAIKU = "claude-haiku-5-5";
export const SONNET = "claude-sonnet-5-5";
export type ModeloBot = typeof HAIKU | typeof SONNET;

/**
 * Precios en USD por millón de tokens (API de Anthropic, verificados el 2026-10-22). La escritura
 * de caché de 5 minutos cuesta 1,25 veces la entrada. Haiku 5.5 sube de precio sobre 100 000
 * tokens de entrada por petición.
 */
const PRECIOS: Record<
  ModeloBot,
  {
    entrada: number;
    salida: number;
    cacheLectura: number;
    largo?: { umbral: number; entrada: number; salida: number };
  }
> = {
  [HAIKU]: {
    entrada: 0.1,
    salida: 0.5,
    cacheLectura: 0.01,
    largo: { umbral: 100_000, entrada: 0.5, salida: 2.5 },
  },
  [SONNET]: { entrada: 2, salida: 10, cacheLectura: 0.2 },
};

export interface Consumo {
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLectura: number;
  tokensCacheEscritura: number;
  costoUsd: number;
}

export const consumoVacio = (): Consumo => ({
  tokensEntrada: 0,
  tokensSalida: 0,
  tokensCacheLectura: 0,
  tokensCacheEscritura: 0,
  costoUsd: 0,
});

/** Costo de una respuesta según su usage. */
export function costoDe(
  modelo: ModeloBot,
  uso: Pick<
    Anthropic.Beta.BetaUsage,
    "input_tokens" | "output_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens"
  >,
): Consumo {
  const p = PRECIOS[modelo];
  const lectura = uso.cache_read_input_tokens ?? 0;
  const escritura = uso.cache_creation_input_tokens ?? 0;
  const totalEntrada = uso.input_tokens + lectura + escritura;
  const largo = p.largo && totalEntrada > p.largo.umbral ? p.largo : undefined;
  const entrada = largo?.entrada ?? p.entrada;
  const salida = largo?.salida ?? p.salida;
  const cacheLectura = largo ? largo.entrada * 0.1 : p.cacheLectura;
  const costo =
    (uso.input_tokens * entrada +
      escritura * entrada * 1.25 +
      lectura * cacheLectura +
      uso.output_tokens * salida) /
    1_000_000;
  return {
    tokensEntrada: uso.input_tokens,
    tokensSalida: uso.output_tokens,
    tokensCacheLectura: lectura,
    tokensCacheEscritura: escritura,
    costoUsd: costo,
  };
}

export function sumarConsumo(a: Consumo, b: Consumo): Consumo {
  return {
    tokensEntrada: a.tokensEntrada + b.tokensEntrada,
    tokensSalida: a.tokensSalida + b.tokensSalida,
    tokensCacheLectura: a.tokensCacheLectura + b.tokensCacheLectura,
    tokensCacheEscritura: a.tokensCacheEscritura + b.tokensCacheEscritura,
    costoUsd: a.costoUsd + b.costoUsd,
  };
}

const PIDE_ANALISIS =
  /\b(reporte|informe|an[aá]lisis|analiza|pipeline|embudo|auditor[ií]a|audita|compar[ae]|resumen|res[uú]meme|briefing|estrategia|tendencia|conversi[oó]n|estancad)/i;

/** Haiku por defecto; Sonnet para reportes y análisis. El escalamiento por fallas está en el agente. */
export function elegirModelo(texto: string): ModeloBot {
  return PIDE_ANALISIS.test(texto) ? SONNET : HAIKU;
}
