import { describe, expect, it } from "vitest";
import {
  auditoriaSubcuenta,
  distancia,
  inicioDelDia,
  leadsSinRespuesta,
  normalizarTag,
  resumenPipeline,
} from "./dominios/reportes.js";
import { ejecutarOperacion } from "./operacion.js";
import { contexto } from "./pruebas/fetch-falso.js";
import type { Llamada } from "./pruebas/fetch-falso.js";

const DIA = 86_400_000;

/** GHL falso por ruta para los reportes. */
function ghl(datos: {
  contactos?: unknown[];
  oportunidades?: unknown[];
  tags?: unknown[];
  conversaciones?: unknown[];
}) {
  return (l: Llamada) => {
    const ruta = l.url.pathname;
    if (ruta === "/contacts/search")
      return { cuerpo: { contacts: datos.contactos ?? [], total: datos.contactos?.length ?? 0 } };
    if (ruta === "/opportunities/search")
      return {
        cuerpo: {
          opportunities: datos.oportunidades ?? [],
          meta: { total: datos.oportunidades?.length ?? 0 },
        },
      };
    if (ruta === "/opportunities/pipelines") {
      return {
        cuerpo: {
          pipelines: [
            {
              id: "P1",
              name: "Ventas",
              stages: [
                { id: "E1", name: "Nuevo", position: 0 },
                { id: "E2", name: "Cita", position: 1 },
                { id: "E3", name: "Cierre", position: 2 },
              ],
            },
          ],
        },
      };
    }
    if (ruta.endsWith("/tags")) return { cuerpo: { tags: datos.tags ?? [] } };
    if (ruta === "/conversations/search")
      return { cuerpo: { conversations: datos.conversaciones ?? [], total: 0 } };
    return { cuerpo: {} };
  };
}

describe("utilidades de reportes", () => {
  it("inicioDelDia respeta la zona horaria", () => {
    const momento = Date.parse("2026-10-22T03:30:00Z"); // 22:30 del 21 en Guayaquil (UTC-5)
    expect(new Date(inicioDelDia(momento, "America/Guayaquil")).toISOString()).toBe(
      "2026-10-21T05:00:00.000Z",
    );
    expect(new Date(inicioDelDia(momento, "UTC")).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });

  it("normalizarTag y distancia detectan tags casi iguales", () => {
    expect(normalizarTag("Cliente_VIP")).toBe(normalizarTag("cliente vip"));
    expect(normalizarTag("Promoción")).toBe("promocion");
    expect(distancia("seguimiento", "seguimeinto")).toBe(2);
    expect(distancia("webinar", "webinars")).toBe(1);
  });
});

describe("resumenPipeline", () => {
  it("calcula valor, etapas, conversión y estancadas", async () => {
    const viejo = new Date(Date.now() - 30 * DIA).toISOString();
    const reciente = new Date().toISOString();
    const { ctx } = contexto(
      ghl({
        oportunidades: [
          {
            id: "O1",
            pipelineId: "P1",
            pipelineStageId: "E1",
            status: "open",
            monetaryValue: 100,
            lastStageChangeAt: viejo,
          },
          {
            id: "O2",
            pipelineId: "P1",
            pipelineStageId: "E2",
            status: "open",
            monetaryValue: 200,
            lastStageChangeAt: reciente,
          },
          { id: "O3", pipelineId: "P1", pipelineStageId: "E3", status: "won", monetaryValue: 500 },
          { id: "O4", pipelineId: "P1", pipelineStageId: "E1", status: "lost" },
        ],
      }),
    );
    const { pipelines } = (await ejecutarOperacion(resumenPipeline, ctx, {})) as {
      pipelines: Record<string, unknown>[];
    };
    expect(pipelines[0]).toMatchObject({
      abiertas: 2,
      valorAbierto: 300,
      ganadas: 1,
      valorGanado: 500,
      perdidas: 1,
      porEtapa: [
        { etapa: "Nuevo", cantidad: 1, valor: 100 },
        { etapa: "Cita", cantidad: 1, valor: 200 },
        { etapa: "Cierre", cantidad: 0, valor: 0 },
      ],
      // Llegaron a Nuevo: 3 (O1, O2, O3 ganada); a Cita: 2; a Cierre: 1.
      conversionPorcentaje: [
        { de: "Nuevo", a: "Cita", tasa: 66.7 },
        { de: "Cita", a: "Cierre", tasa: 50 },
      ],
      estancadas: { total: 1, oportunidades: [{ id: "O1", dias: 30 }] },
    });
  });
});

describe("auditoriaSubcuenta", () => {
  it("puntúa y prioriza los problemas", async () => {
    const { ctx } = contexto(
      ghl({
        contactos: [
          { id: "C1", firstName: "Ana", email: "ana@ejemplo.com", tags: ["vip"] },
          { id: "C2", firstName: "Ana B", email: "ANA@ejemplo.com", tags: [] },
          { id: "C3", tags: [] },
          { id: "C4", firstName: "Luis", phone: "+593 99 123 4567", tags: ["x"] },
        ],
        oportunidades: [{ id: "O1", status: "open", assignedTo: null }],
        tags: [
          { id: "T1", name: "Cliente VIP" },
          { id: "T2", name: "cliente_vip" },
          { id: "T3", name: "otro" },
        ],
      }),
    );
    const r = (await ejecutarOperacion(auditoriaSubcuenta, ctx, {})) as {
      puntaje: number;
      prioridades: { clave: string; cantidad: number }[];
    };
    const claves = Object.fromEntries(r.prioridades.map((p) => [p.clave, p.cantidad]));
    expect(claves).toMatchObject({
      contactos_sin_tag: 2,
      duplicados_probables: 1,
      sin_email_ni_telefono: 1,
      sin_nombre: 1,
      oportunidades_sin_responsable: 1,
      tags_casi_duplicados: 1,
    });
    expect(r.puntaje).toBeGreaterThanOrEqual(0);
    expect(r.puntaje).toBeLessThan(100);
    // Duplicados (50 %) y oportunidades sin responsable (100 %) llegan al tope: van primero.
    expect(
      r.prioridades
        .slice(0, 2)
        .map((p) => p.clave)
        .sort(),
    ).toEqual(["duplicados_probables", "oportunidades_sin_responsable"]);
    expect(JSON.stringify(r)).not.toContain("ana@ejemplo.com");
  });
});

describe("leadsSinRespuesta", () => {
  it("devuelve solo las entrantes más viejas que N horas, de la más vieja a la más nueva", async () => {
    const hace = (h: number) => Date.now() - h * 3_600_000;
    const { ctx } = contexto(
      ghl({
        conversaciones: [
          { id: "V1", lastMessageDirection: "inbound", lastMessageDate: hace(30) },
          { id: "V2", lastMessageDirection: "outbound", lastMessageDate: hace(50) },
          { id: "V3", lastMessageDirection: "inbound", lastMessageDate: hace(2) },
          { id: "V4", lastMessageDirection: "inbound", lastMessageDate: hace(72) },
        ],
      }),
    );
    const r = (await ejecutarOperacion(leadsSinRespuesta, ctx, { horas: 24 })) as {
      leads: { conversacionId: string }[];
    };
    expect(r.leads.map((l) => l.conversacionId)).toEqual(["V4", "V1"]);
  });
});
