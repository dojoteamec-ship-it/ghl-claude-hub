import { beforeAll, describe, expect, it } from "vitest";
import { catalogo } from "./catalogo.js";
import { ejecutarOperacion, type ContextoOperacion, type Operacion } from "./operacion.js";
import { contextoDePrueba, hayCredenciales, type Registro } from "./pruebas/subcuenta-prueba.js";

const ahora = Date.now();
const DIA = 86_400_000;

let ctx: ContextoOperacion;
let token: string;
let registros: Registro[];
const ids: Record<string, string | undefined> = {};

const op = (nombre: string): Operacion => {
  const o = catalogo.find((x) => x.nombre === nombre);
  if (!o) throw new Error(`No existe ${nombre}`);
  return o;
};
const correr = (nombre: string, entrada: unknown = {}) =>
  ejecutarOperacion(op(nombre), ctx, entrada) as Promise<Record<string, unknown>>;

describe.skipIf(!hayCredenciales())("lecturas contra la subcuenta de prueba", () => {
  beforeAll(async () => {
    ({ ctx, token, registros } = await contextoDePrueba());
    const { contactos } = (await correr("buscarContactos", { limite: 1 })) as {
      contactos: { id: string }[];
    };
    ids.contacto = contactos[0]?.id;
    const { calendarios } = (await correr("listarCalendarios")) as {
      calendarios: { id: string; activo: boolean }[];
    };
    ids.calendario = calendarios.find((c) => c.activo)?.id ?? calendarios[0]?.id;
    const { conversaciones } = (await correr("buscarConversaciones", { limite: 1 })) as {
      conversaciones: { id: string }[];
    };
    ids.conversacion = conversaciones[0]?.id;
    const { oportunidades } = (await correr("buscarOportunidades", {
      limite: 1,
      estado: "all",
    })) as {
      oportunidades: { id: string }[];
    };
    ids.oportunidad = oportunidades[0]?.id;
  });

  it("obtenerSubcuenta", async () => {
    const r = await correr("obtenerSubcuenta");
    expect(r.id).toBe(ctx.subcuenta.locationId);
    expect(r.companyId).toBeTruthy();
  });

  it("buscarContactos con filtro y orden", async () => {
    const r = await correr("buscarContactos", {
      filtros: [
        {
          field: "dateAdded",
          operator: "range",
          value: {
            gte: new Date(ahora - 365 * DIA).toISOString(),
            lte: new Date(ahora).toISOString(),
          },
        },
      ],
      limite: 5,
    });
    expect(Array.isArray(r.contactos)).toBe(true);
    expect(typeof r.total).toBe("number");
  });

  it("obtenerContacto, listarNotas y listarTareas", async () => {
    if (!ids.contacto) return;
    expect(await correr("obtenerContacto", { contactId: ids.contacto })).toMatchObject({
      id: ids.contacto,
    });
    expect(await correr("listarNotas", { contactId: ids.contacto })).toHaveProperty("notas");
    expect(await correr("listarTareas", { contactId: ids.contacto })).toHaveProperty("tareas");
  });

  it("buscarDuplicado", async () => {
    const r = await correr("buscarDuplicado", { email: "nadie-existe@ejemplo.com" });
    expect(r).toHaveProperty("contacto");
  });

  it("listarPipelines y buscarOportunidades", async () => {
    const r = (await correr("listarPipelines")) as { pipelines: { etapas: unknown[] }[] };
    expect(r.pipelines.length).toBeGreaterThan(0);
    expect(await correr("buscarOportunidades", { todas: true, estado: "all" })).toHaveProperty(
      "oportunidades",
    );
    expect(await correr("oportunidadesSinMovimiento", { dias: 14 })).toHaveProperty(
      "oportunidades",
    );
    if (ids.oportunidad) {
      expect(await correr("obtenerOportunidad", { oportunidadId: ids.oportunidad })).toMatchObject({
        id: ids.oportunidad,
      });
    }
  });

  it("buscarConversaciones y leerMensajes", async () => {
    if (!ids.conversacion) return;
    const r = await correr("leerMensajes", { conversacionId: ids.conversacion, limite: 5 });
    expect(Array.isArray(r.mensajes)).toBe(true);
  });

  it("citasPorRango y horariosLibres", async () => {
    const r = await correr("citasPorRango", { desde: ahora, hasta: ahora + 7 * DIA });
    expect(Array.isArray(r.citas)).toBe(true);
    if (ids.calendario) {
      const libres = await correr("horariosLibres", {
        calendarioId: ids.calendario,
        desde: ahora,
        hasta: ahora + 7 * DIA,
      });
      expect(libres).toHaveProperty("dias");
    }
  });

  it("configuración: campos, valores y tags", async () => {
    expect(await correr("listarCamposPersonalizados")).toHaveProperty("campos");
    expect(await correr("listarValoresPersonalizados")).toHaveProperty("valores");
    expect(await correr("listarTags")).toHaveProperty("tags");
  });

  it("workflows, formularios, encuestas y usuarios", async () => {
    expect(await correr("listarWorkflows")).toHaveProperty("workflows");
    expect(await correr("enviosFormularios", { desde: ahora - 30 * DIA })).toHaveProperty("envios");
    expect(await correr("enviosEncuestas", { desde: ahora - 30 * DIA })).toHaveProperty("envios");
    const { usuarios } = (await correr("listarUsuarios")) as { usuarios: unknown[] };
    expect(usuarios.length).toBeGreaterThan(0);
  });

  it("pagos: transacciones, órdenes, facturas y productos", async () => {
    expect(await correr("listarTransacciones")).toHaveProperty("transacciones");
    expect(await correr("listarOrdenes")).toHaveProperty("ordenes");
    expect(await correr("listarFacturas")).toHaveProperty("facturas");
    expect(await correr("listarProductos")).toHaveProperty("productos");
  });

  it("los logs no contienen el token ni datos personales", () => {
    const texto = JSON.stringify(registros);
    expect(registros.length).toBeGreaterThan(10);
    expect(texto).not.toContain(token);
    expect(texto).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(
      registros.every((r) => r.evento !== "ghl.peticion" || (r.datos?.estado as number) < 400),
    ).toBe(true);
  });
});
