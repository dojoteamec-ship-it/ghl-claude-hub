import { z } from "zod";
import { type ContextoOperacion, definirEscritura, definirLectura } from "../operacion.js";
import { leerContacto } from "./contactos.js";
import {
  aMilisegundos,
  campo,
  enc,
  exigirMismaSubcuenta,
  fecha,
  id,
  lista,
  sinVacios,
  texto,
  textos,
} from "./comun.js";

export interface Calendario {
  id: string;
  nombre: string | undefined;
  activo: boolean;
  tipo: string | undefined;
  grupoId: string | undefined;
}

const proyectarCalendario = (crudo: unknown): Calendario => ({
  id: String(campo(crudo, "id") ?? ""),
  nombre: texto(campo(crudo, "name")),
  activo: campo(crudo, "isActive") !== false,
  tipo: texto(campo(crudo, "calendarType")),
  grupoId: texto(campo(crudo, "groupId")),
});

export interface Cita {
  id: string;
  titulo: string | undefined;
  calendarioId: string | undefined;
  contactId: string | undefined;
  estado: string | undefined;
  asignadaA: string | undefined;
  inicio: string | undefined;
  fin: string | undefined;
}

const proyectarCita = (crudo: unknown): Cita => ({
  id: String(campo(crudo, "id") ?? ""),
  titulo: texto(campo(crudo, "title")),
  calendarioId: texto(campo(crudo, "calendarId")),
  contactId: texto(campo(crudo, "contactId")),
  estado: texto(campo(crudo, "appointmentStatus")),
  asignadaA: texto(campo(crudo, "assignedUserId")),
  inicio: texto(campo(crudo, "startTime")),
  fin: texto(campo(crudo, "endTime")),
});

async function calendariosDeSubcuenta(ctx: ContextoOperacion): Promise<Calendario[]> {
  const respuesta = await ctx.cliente.peticion<unknown>({
    metodo: "GET",
    ruta: "/calendars/",
    query: { locationId: ctx.subcuenta.locationId },
  });
  return lista(campo(respuesta, "calendars")).map(proyectarCalendario);
}

async function verificarCalendario(ctx: ContextoOperacion, calendarioId: string) {
  const respuesta = await ctx.cliente.peticion<unknown>({
    metodo: "GET",
    ruta: `/calendars/${enc(calendarioId)}`,
  });
  exigirMismaSubcuenta(ctx, campo(respuesta, "calendar"), "El calendario");
}

export const listarCalendarios = definirLectura({
  nombre: "listarCalendarios",
  descripcion: "Lista los calendarios de la subcuenta.",
  entrada: z.object({}),
  ejecutar: async (ctx) => ({ calendarios: await calendariosDeSubcuenta(ctx) }),
});

export const citasPorRango = definirLectura({
  nombre: "citasPorRango",
  descripcion:
    "Citas entre dos fechas. GHL exige calendario, usuario o grupo; si no indicas ninguno, se " +
    "consultan todos los calendarios activos de la subcuenta.",
  entrada: z.object({
    desde: fecha,
    hasta: fecha,
    calendarioId: z.string().optional(),
    usuarioId: z.string().optional(),
    grupoId: z.string().optional(),
  }),
  async ejecutar(ctx, e) {
    const base = {
      locationId: ctx.subcuenta.locationId,
      startTime: String(aMilisegundos(e.desde)),
      endTime: String(aMilisegundos(e.hasta)),
    };
    const consultas =
      e.calendarioId || e.usuarioId || e.grupoId
        ? [{ calendarId: e.calendarioId, userId: e.usuarioId, groupId: e.grupoId }]
        : (await calendariosDeSubcuenta(ctx))
            .filter((c) => c.activo)
            .map((c) => ({ calendarId: c.id, userId: undefined, groupId: undefined }));
    const respuestas = await Promise.all(
      consultas.map((filtro) =>
        ctx.cliente.peticion<unknown>({
          metodo: "GET",
          ruta: "/calendars/events",
          query: { ...base, ...filtro },
        }),
      ),
    );
    const citas = respuestas.flatMap((r) => lista(campo(r, "events")).map(proyectarCita));
    citas.sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));
    return { citas };
  },
});

export const horariosLibres = definirLectura({
  nombre: "horariosLibres",
  descripcion: "Horarios libres de un calendario. El rango no puede pasar de 31 días.",
  entrada: z
    .object({
      calendarioId: id("ID del calendario."),
      desde: fecha,
      hasta: fecha,
      zonaHoraria: z.string().optional().describe("Zona IANA, por ejemplo America/Guayaquil."),
      usuarioId: z.string().optional(),
    })
    .refine(
      (e) => aMilisegundos(e.hasta) - aMilisegundos(e.desde) <= 31 * 86_400_000,
      "El rango no puede pasar de 31 días.",
    ),
  async ejecutar(ctx, e) {
    await verificarCalendario(ctx, e.calendarioId);
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: `/calendars/${enc(e.calendarioId)}/free-slots`,
      query: {
        startDate: aMilisegundos(e.desde),
        endDate: aMilisegundos(e.hasta),
        timezone: e.zonaHoraria,
        userId: e.usuarioId,
      },
    });
    const dias: Record<string, string[]> = {};
    if (respuesta && typeof respuesta === "object") {
      for (const [dia, valor] of Object.entries(respuesta)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) dias[dia] = textos(campo(valor, "slots"));
      }
    }
    return { dias };
  },
});

const datosCita = {
  titulo: z.string().optional(),
  inicio: z.iso.datetime({ offset: true }).describe("Inicio, ISO 8601 con zona."),
  fin: z.iso.datetime({ offset: true }).optional().describe("Fin, ISO 8601 con zona."),
  estado: z.enum(["new", "confirmed", "cancelled", "showed", "noshow", "invalid"]).optional(),
  asignadaA: z.string().optional().describe("ID del usuario responsable."),
  descripcion: z.string().optional(),
};

const citaDeRespuesta = (respuesta: unknown) =>
  proyectarCita(campo(respuesta, "event") ?? campo(respuesta, "appointment") ?? respuesta);

export const crearCita = definirEscritura({
  nombre: "crearCita",
  tipo: "escritura",
  descripcion: "Agenda una cita para un contacto en un calendario.",
  entrada: z.object({
    calendarioId: id("ID del calendario."),
    contactId: id("ID del contacto."),
    ...datosCita,
  }),
  async preparar(ctx, e) {
    await verificarCalendario(ctx, e.calendarioId);
    await leerContacto(ctx, e.contactId);
    return {
      metodo: "POST",
      ruta: "/calendars/events/appointments",
      cuerpo: sinVacios({
        locationId: ctx.subcuenta.locationId,
        calendarId: e.calendarioId,
        contactId: e.contactId,
        title: e.titulo,
        startTime: e.inicio,
        endTime: e.fin,
        appointmentStatus: e.estado,
        assignedUserId: e.asignadaA,
        description: e.descripcion,
      }),
    };
  },
  interpretar: citaDeRespuesta,
});

export const actualizarCita = definirEscritura({
  nombre: "actualizarCita",
  tipo: "escritura",
  descripcion: "Cambia hora, estado, título o responsable de una cita.",
  entrada: z.object({
    citaId: id("ID de la cita."),
    ...datosCita,
    inicio: datosCita.inicio.optional(),
  }),
  async preparar(ctx, e) {
    const actual = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: `/calendars/events/appointments/${enc(e.citaId)}`,
    });
    exigirMismaSubcuenta(ctx, campo(actual, "appointment") ?? campo(actual, "event"), "La cita");
    return {
      metodo: "PUT",
      ruta: `/calendars/events/appointments/${enc(e.citaId)}`,
      cuerpo: sinVacios({
        title: e.titulo,
        startTime: e.inicio,
        endTime: e.fin,
        appointmentStatus: e.estado,
        assignedUserId: e.asignadaA,
        description: e.descripcion,
      }),
    };
  },
  interpretar: citaDeRespuesta,
});

export const operacionesCalendarios = [
  listarCalendarios,
  citasPorRango,
  horariosLibres,
  crearCita,
  actualizarCita,
];
