/**
 * Control de límites de la API de GHL.
 * Documentación: https://marketplace.gohighlevel.com/docs/other/rate-limits.md
 * Ráfaga: 100 peticiones cada 10 s por subcuenta. Diario: 200 000 por subcuenta.
 */

export interface EstadoLimites {
  /** Peticiones que quedan en la ventana de ráfaga actual. */
  restantesRafaga?: number;
  /** Duración de la ventana de ráfaga en milisegundos. */
  ventanaMs?: number;
  /** Peticiones que quedan en el día. */
  restantesDia?: number;
}

function numero(cabeceras: Headers, nombre: string): number | undefined {
  const valor = cabeceras.get(nombre);
  if (valor === null || valor.trim() === "") return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/** Lee los headers X-RateLimit-* de una respuesta de GHL. */
export function leerLimites(cabeceras: Headers): EstadoLimites {
  const estado: EstadoLimites = {};
  const rafaga = numero(cabeceras, "x-ratelimit-remaining");
  const ventana = numero(cabeceras, "x-ratelimit-interval-milliseconds");
  const dia = numero(cabeceras, "x-ratelimit-daily-remaining");
  if (rafaga !== undefined) estado.restantesRafaga = rafaga;
  if (ventana !== undefined) estado.ventanaMs = ventana;
  if (dia !== undefined) estado.restantesDia = dia;
  return estado;
}

/** Milisegundos indicados por Retry-After (segundos o fecha HTTP), si viene. */
export function esperaRetryAfter(cabeceras: Headers, ahora = Date.now()): number | undefined {
  const valor = cabeceras.get("retry-after");
  if (valor === null) return undefined;
  const segundos = Number(valor);
  if (Number.isFinite(segundos)) return Math.max(0, segundos * 1000);
  const fecha = Date.parse(valor);
  return Number.isNaN(fecha) ? undefined : Math.max(0, fecha - ahora);
}

export interface OpcionesEspera {
  /** Espera base del primer reintento, en ms. */
  baseMs: number;
  /** Tope de cualquier espera, en ms. */
  maximoMs: number;
  /** Número aleatorio en [0, 1); se inyecta en pruebas. */
  azar?: () => number;
}

/**
 * Espera antes del reintento `intento` (0 es el primero): exponencial con jitter, salvo que GHL
 * indique cuánto esperar con Retry-After o con una ventana de ráfaga agotada.
 */
export function calcularEspera(
  intento: number,
  { baseMs, maximoMs, azar = Math.random }: OpcionesEspera,
  indicada?: number,
): number {
  if (indicada !== undefined) return Math.min(indicada, maximoMs);
  const exponencial = baseMs * 2 ** intento;
  const conJitter = exponencial / 2 + azar() * (exponencial / 2);
  return Math.min(Math.round(conJitter), maximoMs);
}

/** Limita cuántas tareas corren a la vez. */
export class Semaforo {
  private activos = 0;
  private readonly cola: (() => void)[] = [];

  constructor(private readonly maximo: number) {
    if (!Number.isInteger(maximo) || maximo < 1) {
      throw new RangeError("La concurrencia máxima debe ser un entero mayor que 0.");
    }
  }

  async ejecutar<T>(tarea: () => Promise<T>): Promise<T> {
    await this.adquirir();
    try {
      return await tarea();
    } finally {
      this.liberar();
    }
  }

  get enCurso(): number {
    return this.activos;
  }

  private adquirir(): Promise<void> {
    if (this.activos < this.maximo) {
      this.activos += 1;
      return Promise.resolve();
    }
    return new Promise((resolver) => {
      this.cola.push(() => {
        this.activos += 1;
        resolver();
      });
    });
  }

  private liberar(): void {
    this.activos -= 1;
    this.cola.shift()?.();
  }
}
