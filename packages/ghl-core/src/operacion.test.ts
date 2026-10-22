import { describe, expect, it } from "vitest";
import { z } from "zod";
import { catalogo, buscarOperacion } from "./catalogo.js";
import {
  agregarTags,
  borrarContacto,
  buscarContactos,
  crearContacto,
  obtenerContacto,
  proyectarContacto,
} from "./dominios/contactos.js";
import { citasPorRango } from "./dominios/calendarios.js";
import { oportunidadesSinMovimiento } from "./dominios/oportunidades.js";
import { listarUsuarios } from "./dominios/usuarios.js";
import { ErrorGhl } from "./errores.js";
import { ejecutarOperacion, esSimulacion } from "./operacion.js";
import { SUBCUENTA_PRUEBA, contexto } from "./pruebas/fetch-falso.js";

const contactoCrudo = {
  id: "C1",
  locationId: "LOC_PRUEBA",
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@ejemplo.com",
  phone: "+593990000000",
  tags: ["es_prueba"],
  attributionSource: { ip: "10.0.0.1", userAgent: "Mozilla", utmSource: "fb" },
};

describe("catálogo", () => {
  it("tiene nombres únicos y una clasificación válida", () => {
    const nombres = catalogo.map((o) => o.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const o of catalogo) {
      expect(["lectura", "escritura", "sensible", "destructiva"]).toContain(o.tipo);
      expect(o.descripcion.length).toBeGreaterThan(10);
    }
  });

  it("cubre los dominios mínimos del plan", () => {
    for (const nombre of [
      "buscarContactos",
      "obtenerContacto",
      "crearContacto",
      "actualizarContacto",
      "upsertContacto",
      "agregarTags",
      "quitarTags",
      "listarNotas",
      "crearNota",
      "listarTareas",
      "crearTarea",
      "buscarDuplicado",
      "listarPipelines",
      "buscarOportunidades",
      "obtenerOportunidad",
      "crearOportunidad",
      "actualizarOportunidad",
      "moverEtapa",
      "cambiarEstadoOportunidad",
      "buscarConversaciones",
      "leerMensajes",
      "enviarMensaje",
      "listarCalendarios",
      "citasPorRango",
      "horariosLibres",
      "crearCita",
      "actualizarCita",
      "obtenerSubcuenta",
      "listarCamposPersonalizados",
      "listarValoresPersonalizados",
      "listarTags",
      "listarWorkflows",
      "inscribirEnWorkflow",
      "sacarDeWorkflow",
      "enviosFormularios",
      "enviosEncuestas",
      "listarUsuarios",
      "listarTransacciones",
      "listarOrdenes",
      "listarFacturas",
      "listarProductos",
      "borrarContacto",
      "borrarOportunidad",
    ]) {
      expect(buscarOperacion(nombre), nombre).toBeDefined();
    }
  });

  it("toda escritura acepta simular y ninguna entrada acepta locationId", () => {
    for (const o of catalogo) {
      const esquema = z.toJSONSchema(o.entrada, { io: "input" }) as {
        properties?: Record<string, unknown>;
      };
      expect(Object.keys(esquema.properties ?? {}), o.nombre).not.toContain("locationId");
      if (o.tipo !== "lectura") expect(esquema.properties, o.nombre).toHaveProperty("simular");
    }
  });

  it("clasifica como sensibles el envío de mensajes y la inscripción en workflows", () => {
    expect(buscarOperacion("enviarMensaje")?.tipo).toBe("sensible");
    expect(buscarOperacion("inscribirEnWorkflow")?.tipo).toBe("sensible");
    expect(buscarOperacion("borrarContacto")?.tipo).toBe("destructiva");
  });
});

describe("ejecutarOperacion", () => {
  it("inyecta el locationId de la subcuenta", async () => {
    const { ctx, llamadas } = contexto([{ cuerpo: { contacts: [], total: 0 } }]);
    await ejecutarOperacion(buscarContactos, ctx, { locationId: "OTRA" });
    expect(llamadas[0]?.cuerpo).toMatchObject({ locationId: "LOC_PRUEBA", pageLimit: 20 });
  });

  it("valida la entrada con mensajes en español", async () => {
    const { ctx } = contexto([]);
    await expect(ejecutarOperacion(obtenerContacto, ctx, {})).rejects.toMatchObject({
      tipo: "validacion",
    });
  });

  it("simular devuelve la petición sin escribir", async () => {
    const { ctx, llamadas } = contexto([]);
    const resultado = await ejecutarOperacion(crearContacto, ctx, {
      firstName: "Prueba",
      email: "prueba@ejemplo.com",
      simular: true,
    });
    expect(esSimulacion(resultado)).toBe(true);
    expect(resultado).toMatchObject({
      operacion: "crearContacto",
      tipo: "escritura",
      peticion: {
        metodo: "POST",
        ruta: "/contacts/",
        cuerpo: { firstName: "Prueba", locationId: "LOC_PRUEBA" },
      },
    });
    expect(llamadas).toHaveLength(0);
  });

  it("simular sí lee por ID antes, pero no escribe", async () => {
    const { ctx, llamadas } = contexto([{ cuerpo: { contact: contactoCrudo } }]);
    const resultado = await ejecutarOperacion(borrarContacto, ctx, {
      contactId: "C1",
      simular: true,
    });
    expect(esSimulacion(resultado)).toBe(true);
    expect(llamadas.map((l) => l.metodo)).toEqual(["GET"]);
  });

  it("lee por ID antes de escribir y luego escribe", async () => {
    const { ctx, llamadas } = contexto([
      { cuerpo: { contact: contactoCrudo } },
      { estado: 201, cuerpo: { tags: ["es_prueba", "nuevo"] } },
    ]);
    const resultado = await ejecutarOperacion(agregarTags, ctx, {
      contactId: "C1",
      tags: ["nuevo"],
    });
    expect(resultado).toEqual({ tags: ["es_prueba", "nuevo"] });
    expect(llamadas.map((l) => `${l.metodo} ${l.url.pathname}`)).toEqual([
      "GET /contacts/C1",
      "POST /contacts/C1/tags",
    ]);
  });

  it("no escribe sobre un recurso de otra subcuenta", async () => {
    const { ctx, llamadas } = contexto([
      { cuerpo: { contact: { ...contactoCrudo, locationId: "OTRA" } } },
    ]);
    await expect(ejecutarOperacion(borrarContacto, ctx, { contactId: "C1" })).rejects.toMatchObject(
      { tipo: "no_encontrado" },
    );
    expect(llamadas).toHaveLength(1);
  });

  it("en producción exige confirmación humana para escribir", async () => {
    const produccion = { ...SUBCUENTA_PRUEBA, alias: "cliente", entorno: "produccion" as const };
    const { ctx, llamadas } = contexto([{ estado: 201, cuerpo: { contact: contactoCrudo } }], {
      subcuenta: produccion,
    });
    await expect(ejecutarOperacion(crearContacto, ctx, { firstName: "X" })).rejects.toMatchObject({
      tipo: "confirmacion_requerida",
    });
    expect(llamadas).toHaveLength(0);

    // La simulación no necesita confirmación.
    const simulada = await ejecutarOperacion(crearContacto, ctx, { firstName: "X", simular: true });
    expect(esSimulacion(simulada)).toBe(true);

    const confirmada = await ejecutarOperacion(
      crearContacto,
      { ...ctx, confirmacionHumana: true },
      { firstName: "X" },
    );
    expect(confirmada).toMatchObject({ id: "C1" });
  });

  it("en producción las lecturas no piden confirmación", async () => {
    const produccion = { ...SUBCUENTA_PRUEBA, entorno: "produccion" as const };
    const { ctx } = contexto([{ cuerpo: { contacts: [], total: 0 } }], { subcuenta: produccion });
    await expect(ejecutarOperacion(buscarContactos, ctx, {})).resolves.toMatchObject({ total: 0 });
  });
});

describe("proyecciones", () => {
  it("el contacto no trae IP, navegador ni UTM", () => {
    const contacto = proyectarContacto(contactoCrudo);
    const texto = JSON.stringify(contacto);
    expect(texto).not.toContain("10.0.0.1");
    expect(texto).not.toContain("Mozilla");
    expect(texto).not.toContain("utm");
    expect(contacto).toMatchObject({ id: "C1", nombre: "Ana Pérez", tags: ["es_prueba"] });
  });
});

describe("operaciones con varias peticiones", () => {
  it("citasPorRango consulta cada calendario activo si no se indica uno", async () => {
    const { ctx, llamadas } = contexto([
      {
        cuerpo: {
          calendars: [
            { id: "K1", isActive: true },
            { id: "K2", isActive: false },
          ],
        },
      },
      {
        cuerpo: {
          events: [{ id: "E1", calendarId: "K1", startTime: "2026-10-23T10:00:00Z" }],
        },
      },
    ]);
    const resultado = await ejecutarOperacion(citasPorRango, ctx, {
      desde: "2026-10-22",
      hasta: "2026-10-29",
    });
    expect(resultado).toMatchObject({ citas: [{ id: "E1", calendarioId: "K1" }] });
    const consulta = llamadas[1]?.url.searchParams;
    expect(consulta?.get("calendarId")).toBe("K1");
    expect(consulta?.get("startTime")).toBe(String(Date.parse("2026-10-22")));
  });

  it("listarUsuarios toma el companyId de la subcuenta", async () => {
    const { ctx, llamadas } = contexto([
      { cuerpo: { location: { id: "LOC_PRUEBA", companyId: "CO1" } } },
      { cuerpo: { users: [{ id: "U1", name: "Ana", email: "a@b.co", roles: { role: "admin" } }] } },
    ]);
    const resultado = await ejecutarOperacion(listarUsuarios, ctx, {});
    expect(llamadas[1]?.url.searchParams.get("companyId")).toBe("CO1");
    expect(JSON.stringify(resultado)).not.toContain("a@b.co");
  });

  it("oportunidadesSinMovimiento pagina y filtra por fecha", async () => {
    const vieja = { id: "O1", status: "open", lastStageChangeAt: "2020-01-01T00:00:00Z" };
    const nueva = { id: "O2", status: "open", lastStageChangeAt: new Date().toISOString() };
    const { ctx, llamadas } = contexto([
      { cuerpo: { opportunities: [vieja], meta: { total: 2, startAfter: 1, startAfterId: "O1" } } },
      { cuerpo: { opportunities: [nueva], meta: { total: 2 } } },
    ]);
    const resultado = await ejecutarOperacion(oportunidadesSinMovimiento, ctx, { dias: 14 });
    expect(resultado).toMatchObject({ oportunidades: [{ id: "O1" }] });
    expect(llamadas[1]?.url.searchParams.get("startAfterId")).toBe("O1");
  });

  it("un error de GHL llega como ErrorGhl", async () => {
    const { ctx } = contexto([{ estado: 400, cuerpo: { message: "Contact not found for id:X" } }]);
    await expect(
      ejecutarOperacion(obtenerContacto, ctx, { contactId: "X" }),
    ).rejects.toBeInstanceOf(ErrorGhl);
  });
});
