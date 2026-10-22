import { describe, expect, it } from "vitest";
import { configuracionApi } from "./cliente.js";
import { ErrorGhl } from "./errores.js";
import { TOKEN_FALSO, clienteFalso } from "./pruebas/fetch-falso.js";
import type { NivelRegistro } from "./registro.js";

describe("ClienteGhl", () => {
  it("manda Authorization, Version v3 y la query", async () => {
    const { cliente, llamadas } = clienteFalso([{ cuerpo: { ok: true } }]);
    await cliente.peticion({
      metodo: "GET",
      ruta: "/calendars/events",
      query: { locationId: "L1", calendarId: undefined, ids: ["a", "b"], limite: 5 },
    });
    const [llamada] = llamadas;
    expect(llamada?.cabeceras.Authorization).toBe(`Bearer ${TOKEN_FALSO}`);
    expect(llamada?.cabeceras.Version).toBe("v3");
    expect(llamada?.url.pathname).toBe("/calendars/events");
    expect(llamada?.url.searchParams.get("locationId")).toBe("L1");
    expect(llamada?.url.searchParams.has("calendarId")).toBe(false);
    expect(llamada?.url.searchParams.getAll("ids")).toEqual(["a", "b"]);
  });

  it("reintenta un 429 esperando lo que indica Retry-After", async () => {
    const { cliente, llamadas, esperas } = clienteFalso([
      { estado: 429, cabeceras: { "retry-after": "2" } },
      { cuerpo: { ok: true } },
    ]);
    await expect(cliente.peticion({ metodo: "POST", ruta: "/contacts/" })).resolves.toEqual({
      ok: true,
    });
    expect(llamadas).toHaveLength(2);
    expect(esperas).toEqual([2000]);
  });

  it("ante un 429 sin Retry-After espera la ventana de ráfaga", async () => {
    const { cliente, esperas } = clienteFalso([
      {
        estado: 429,
        cabeceras: { "x-ratelimit-remaining": "0", "x-ratelimit-interval-milliseconds": "10000" },
      },
      { cuerpo: {} },
    ]);
    await cliente.peticion({ metodo: "GET", ruta: "/x" });
    // Se espera una sola vez: la sugerida por el 429, sin sumar la de ráfaga agotada.
    expect(esperas).toEqual([10_000]);
  });

  it("reintenta un 5xx en GET con espera exponencial", async () => {
    const { cliente, llamadas, esperas } = clienteFalso([
      { estado: 502 },
      { estado: 503 },
      { cuerpo: { ok: 1 } },
    ]);
    await cliente.peticion({ metodo: "GET", ruta: "/x" });
    expect(llamadas).toHaveLength(3);
    expect(esperas).toEqual([375, 750]);
  });

  it("no reintenta un 5xx en POST, para no duplicar altas", async () => {
    const { cliente, llamadas } = clienteFalso([{ estado: 500 }, { cuerpo: {} }]);
    await expect(cliente.peticion({ metodo: "POST", ruta: "/contacts/" })).rejects.toMatchObject({
      tipo: "servidor",
    });
    expect(llamadas).toHaveLength(1);
  });

  it("se rinde después del máximo de reintentos", async () => {
    const { cliente, llamadas } = clienteFalso(() => ({ estado: 503 }), { reintentos: 2 });
    await expect(cliente.peticion({ metodo: "GET", ruta: "/x" })).rejects.toBeInstanceOf(ErrorGhl);
    expect(llamadas).toHaveLength(3);
  });

  it("reintenta fallas de red en lecturas", async () => {
    const { cliente, llamadas } = clienteFalso([new TypeError("fetch failed"), { cuerpo: {} }]);
    await cliente.peticion({ metodo: "GET", ruta: "/x" });
    expect(llamadas).toHaveLength(2);
  });

  it("espera la ventana si la ráfaga quedó en cero", async () => {
    const { cliente, esperas } = clienteFalso([
      {
        cuerpo: {},
        cabeceras: { "x-ratelimit-remaining": "0", "x-ratelimit-interval-milliseconds": "10000" },
      },
      { cuerpo: {} },
    ]);
    await cliente.peticion({ metodo: "GET", ruta: "/a" });
    await cliente.peticion({ metodo: "GET", ruta: "/b" });
    expect(esperas).toEqual([10_000]);
    expect(cliente.limites.restantesRafaga).toBeUndefined();
  });

  it("corta si se agotó el cupo diario", async () => {
    const { cliente, llamadas } = clienteFalso([
      { cuerpo: {}, cabeceras: { "x-ratelimit-daily-remaining": "0" } },
    ]);
    await cliente.peticion({ metodo: "GET", ruta: "/a" });
    await expect(cliente.peticion({ metodo: "GET", ruta: "/b" })).rejects.toMatchObject({
      tipo: "limite",
    });
    expect(llamadas).toHaveLength(1);
  });

  it("normaliza errores en español y distingue falta de scope", async () => {
    const { cliente } = clienteFalso([
      { estado: 401, cuerpo: { message: "The token is not authorized for this scope." } },
      { estado: 422, cuerpo: { message: ["locationId must be a string"] } },
      { estado: 404, cuerpo: { message: "Contact not found" } },
    ]);
    await expect(cliente.peticion({ metodo: "GET", ruta: "/a" })).rejects.toMatchObject({
      tipo: "permiso",
      estado: 401,
    });
    await expect(cliente.peticion({ metodo: "GET", ruta: "/b" })).rejects.toMatchObject({
      tipo: "validacion",
      detalle: "locationId must be a string",
    });
    const error = await cliente.peticion({ metodo: "GET", ruta: "/c" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorGhl);
    expect((error as ErrorGhl).message).toMatch(/^GHL no encontró/);
  });

  it("devuelve undefined en respuestas sin cuerpo", async () => {
    const { cliente } = clienteFalso([{ estado: 204 }]);
    await expect(cliente.peticion({ metodo: "DELETE", ruta: "/x" })).resolves.toBeUndefined();
  });

  it("limita la concurrencia por subcuenta", async () => {
    let activas = 0;
    let maximo = 0;
    const { cliente } = clienteFalso(() => ({ cuerpo: {} }), {
      concurrencia: 2,
      fetch: async () => {
        activas += 1;
        maximo = Math.max(maximo, activas);
        await new Promise((r) => setTimeout(r, 5));
        activas -= 1;
        return new Response("{}");
      },
    });
    await Promise.all(
      Array.from({ length: 5 }, () => cliente.peticion({ metodo: "GET", ruta: "/x" })),
    );
    expect(maximo).toBe(2);
  });

  it("no registra el token, ni cuerpos, ni datos personales", async () => {
    const registros: { nivel: NivelRegistro; evento: string; datos?: Record<string, unknown> }[] =
      [];
    const { cliente } = clienteFalso(
      [
        {
          estado: 400,
          cuerpo: { message: `Bad token ${TOKEN_FALSO} for ana@ejemplo.com`, traceId: "t1" },
        },
      ],
      {
        registrador: {
          registrar: (nivel, evento, datos) =>
            registros.push({ nivel, evento, ...(datos ? { datos } : {}) }),
        },
      },
    );
    const error = (await cliente
      .peticion({ metodo: "POST", ruta: "/contacts/", cuerpo: { email: "ana@ejemplo.com" } })
      .catch((e: unknown) => e)) as ErrorGhl;
    const todo = JSON.stringify(registros) + error.message;
    expect(todo).not.toContain(TOKEN_FALSO);
    expect(todo).not.toContain("ana@ejemplo.com");
    expect(registros[0]?.datos).toMatchObject({ metodo: "POST", estado: 400, traceId: "t1" });
  });

  it("rechaza un token vacío", () => {
    expect(() => clienteFalso([], { token: " " })).toThrow(ErrorGhl);
  });
});

describe("configuracionApi", () => {
  it("usa v3 y la URL oficial por defecto", () => {
    expect(configuracionApi({})).toEqual({
      baseUrl: "https://services.leadconnectorhq.com",
      version: "v3",
    });
  });

  it("respeta GHL_API_BASE y GHL_API_VERSION", () => {
    expect(
      configuracionApi({ GHL_API_BASE: "http://localhost:1", GHL_API_VERSION: "2021-07-28" }),
    ).toEqual({
      baseUrl: "http://localhost:1",
      version: "2021-07-28",
    });
  });
});
