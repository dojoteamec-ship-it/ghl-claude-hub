import { describe, expect, it } from "vitest";
import { Semaforo, calcularEspera, esperaRetryAfter, leerLimites } from "./limites.js";

describe("leerLimites", () => {
  it("lee los headers X-RateLimit de GHL", () => {
    const cabeceras = new Headers({
      "x-ratelimit-remaining": "7",
      "x-ratelimit-interval-milliseconds": "10000",
      "x-ratelimit-daily-remaining": "199000",
    });
    expect(leerLimites(cabeceras)).toEqual({
      restantesRafaga: 7,
      ventanaMs: 10_000,
      restantesDia: 199_000,
    });
  });

  it("ignora headers ausentes o inválidos", () => {
    expect(leerLimites(new Headers({ "x-ratelimit-remaining": "abc" }))).toEqual({});
  });
});

describe("esperaRetryAfter", () => {
  it("acepta segundos", () => {
    expect(esperaRetryAfter(new Headers({ "retry-after": "3" }))).toBe(3000);
  });

  it("acepta una fecha HTTP", () => {
    const ahora = Date.parse("2026-10-22T12:00:00Z");
    const cabeceras = new Headers({ "retry-after": "Thu, 22 Oct 2026 12:00:05 GMT" });
    expect(esperaRetryAfter(cabeceras, ahora)).toBe(5000);
  });
});

describe("calcularEspera", () => {
  const opciones = { baseMs: 500, maximoMs: 30_000, azar: () => 0.5 };

  it("crece de forma exponencial con jitter", () => {
    expect(calcularEspera(0, opciones)).toBe(375);
    expect(calcularEspera(1, opciones)).toBe(750);
    expect(calcularEspera(2, opciones)).toBe(1500);
  });

  it("respeta el tope", () => {
    expect(calcularEspera(20, opciones)).toBe(30_000);
  });

  it("prefiere la espera que indica GHL", () => {
    expect(calcularEspera(0, opciones, 8000)).toBe(8000);
    expect(calcularEspera(0, opciones, 90_000)).toBe(30_000);
  });
});

describe("Semaforo", () => {
  it("no deja pasar más tareas que el máximo", async () => {
    const semaforo = new Semaforo(2);
    let maximoVisto = 0;
    const tarea = async () => {
      maximoVisto = Math.max(maximoVisto, semaforo.enCurso);
      await new Promise((r) => setTimeout(r, 5));
    };
    await Promise.all(Array.from({ length: 6 }, () => semaforo.ejecutar(tarea)));
    expect(maximoVisto).toBe(2);
    expect(semaforo.enCurso).toBe(0);
  });

  it("libera el cupo aunque la tarea falle", async () => {
    const semaforo = new Semaforo(1);
    await expect(semaforo.ejecutar(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(semaforo.ejecutar(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
