import { randomUUID } from "node:crypto";
import { type Consumo, consumoVacio, sumarConsumo } from "../modelos.js";
import type {
  AccionPendiente,
  Almacen,
  EstadoAccion,
  RegistroAuditoria,
  SubcuentaBot,
  TurnoHistorial,
  UsoDia,
  UsuarioBot,
} from "./tipos.js";

/** Almacén en memoria para pruebas y desarrollo. Mismo comportamiento que el de Supabase. */
export class AlmacenMemoria implements Almacen {
  readonly datos = {
    subcuentas: [] as SubcuentaBot[],
    usuarios: [] as UsuarioBot[],
    accesos: [] as { usuarioId: string; subcuentaId: string }[],
    chats: new Map<number, string>(),
    historial: [] as (TurnoHistorial & { chatId: number; subcuentaId: string; creado: number })[],
    pendientes: [] as AccionPendiente[],
    auditoria: [] as (RegistroAuditoria & { fecha: Date })[],
    uso: new Map<string, UsoDia & { fecha: string; subcuentaId: string; usuarioId: string }>(),
    avisos: new Set<string>(),
  };

  constructor(private readonly ahora: () => Date = () => new Date()) {}

  subcuentas = () => Promise.resolve(this.datos.subcuentas.filter((s) => s.activa));
  subcuentaPorId = (id: string) => Promise.resolve(this.datos.subcuentas.find((s) => s.id === id));

  guardarSubcuenta(datos: Omit<SubcuentaBot, "id">) {
    const existente = this.datos.subcuentas.find((s) => s.alias === datos.alias);
    const subcuenta = { ...datos, id: existente?.id ?? randomUUID() };
    this.datos.subcuentas = [
      ...this.datos.subcuentas.filter((s) => s.alias !== datos.alias),
      subcuenta,
    ];
    return Promise.resolve(subcuenta);
  }

  usuarioPorTelegram = (telegramId: number) =>
    Promise.resolve(this.datos.usuarios.find((u) => u.telegramId === telegramId && u.activo));

  guardarUsuario(datos: Omit<UsuarioBot, "id">) {
    const existente = this.datos.usuarios.find((u) => u.telegramId === datos.telegramId);
    const usuario = { ...datos, id: existente?.id ?? randomUUID() };
    this.datos.usuarios = [
      ...this.datos.usuarios.filter((u) => u.telegramId !== datos.telegramId),
      usuario,
    ];
    return Promise.resolve(usuario);
  }

  usuariosAdmin = () =>
    Promise.resolve(this.datos.usuarios.filter((u) => u.rol === "admin" && u.activo));

  accesosAdmin = (usuarioId: string) =>
    Promise.resolve(
      this.datos.accesos.filter((a) => a.usuarioId === usuarioId).map((a) => a.subcuentaId),
    );

  darAccesoAdmin(usuarioId: string, subcuentaId: string) {
    if (
      !this.datos.accesos.some((a) => a.usuarioId === usuarioId && a.subcuentaId === subcuentaId)
    ) {
      this.datos.accesos.push({ usuarioId, subcuentaId });
    }
    return Promise.resolve();
  }

  subcuentaActivaDelChat = (chatId: number) => Promise.resolve(this.datos.chats.get(chatId));

  fijarSubcuentaDelChat(chatId: number, _usuarioId: string, subcuentaId: string) {
    this.datos.chats.set(chatId, subcuentaId);
    return Promise.resolve();
  }

  historial(chatId: number, subcuentaId: string, limite: number) {
    const turnos = this.datos.historial.filter(
      (h) => h.chatId === chatId && h.subcuentaId === subcuentaId,
    );
    return Promise.resolve(turnos.slice(-limite).map(({ rol, contenido }) => ({ rol, contenido })));
  }

  agregarHistorial(chatId: number, subcuentaId: string, turnos: TurnoHistorial[]) {
    const creado = this.ahora().getTime();
    this.datos.historial.push(...turnos.map((t) => ({ ...t, chatId, subcuentaId, creado })));
    return Promise.resolve();
  }

  borrarHistorial(chatId: number) {
    this.datos.historial = this.datos.historial.filter((h) => h.chatId !== chatId);
    return Promise.resolve();
  }

  crearPendiente(datos: Omit<AccionPendiente, "id" | "estado" | "vence">, minutos: number) {
    const accion: AccionPendiente = {
      ...datos,
      id: randomUUID(),
      estado: "pendiente",
      vence: new Date(this.ahora().getTime() + minutos * 60_000),
    };
    this.datos.pendientes.push(accion);
    return Promise.resolve(accion);
  }

  pendiente = (id: string) => Promise.resolve(this.datos.pendientes.find((p) => p.id === id));

  resolverPendiente(id: string, estado: Exclude<EstadoAccion, "pendiente">) {
    const accion = this.datos.pendientes.find((p) => p.id === id);
    if (!accion || accion.estado !== "pendiente") return Promise.resolve(false);
    if (estado === "ejecutada" && accion.vence.getTime() <= this.ahora().getTime())
      return Promise.resolve(false);
    accion.estado = estado;
    // Igual que en Supabase: al resolver se borran los datos de la acción.
    accion.entrada = {};
    return Promise.resolve(true);
  }

  marcarFallida(id: string) {
    const accion = this.datos.pendientes.find((p) => p.id === id);
    if (accion) accion.estado = "fallida";
    return Promise.resolve();
  }

  cancelarPendientesDelChat(chatId: number) {
    let n = 0;
    for (const p of this.datos.pendientes) {
      if (p.chatId === chatId && p.estado === "pendiente") {
        p.estado = "cancelada";
        n += 1;
      }
    }
    return Promise.resolve(n);
  }

  auditar(registro: RegistroAuditoria) {
    this.datos.auditoria.push({ ...registro, fecha: this.ahora() });
    return Promise.resolve();
  }

  registrarUso(
    fecha: string,
    subcuentaId: string,
    usuarioId: string,
    _modelo: string,
    consumo: Consumo,
  ) {
    const clave = `${fecha}|${subcuentaId}|${usuarioId}`;
    const previo = this.datos.uso.get(clave) ?? {
      ...consumoVacio(),
      consultas: 0,
      fecha,
      subcuentaId,
      usuarioId,
    };
    this.datos.uso.set(clave, {
      ...previo,
      ...sumarConsumo(previo, consumo),
      consultas: previo.consultas + 1,
    });
    return Promise.resolve();
  }

  usoDelDia(fecha: string, filtro: { subcuentaId?: string; usuarioId?: string }) {
    let total: UsoDia = { ...consumoVacio(), consultas: 0 };
    for (const u of this.datos.uso.values()) {
      if (u.fecha !== fecha) continue;
      if (filtro.subcuentaId && u.subcuentaId !== filtro.subcuentaId) continue;
      if (filtro.usuarioId && u.usuarioId !== filtro.usuarioId) continue;
      total = { ...sumarConsumo(total, u), consultas: total.consultas + u.consultas };
    }
    return Promise.resolve(total);
  }

  usoPorSubcuenta(desde: string, hasta: string) {
    const porSubcuenta = new Map<string, UsoDia & { subcuentaId: string }>();
    for (const u of this.datos.uso.values()) {
      if (u.fecha < desde || u.fecha > hasta) continue;
      const previo = porSubcuenta.get(u.subcuentaId) ?? {
        ...consumoVacio(),
        consultas: 0,
        subcuentaId: u.subcuentaId,
      };
      porSubcuenta.set(u.subcuentaId, {
        ...sumarConsumo(previo, u),
        consultas: previo.consultas + u.consultas,
        subcuentaId: u.subcuentaId,
      });
    }
    return Promise.resolve([...porSubcuenta.values()]);
  }

  marcarAviso(fecha: string, clave: string) {
    const llave = `${fecha}|${clave}`;
    if (this.datos.avisos.has(llave)) return Promise.resolve(false);
    this.datos.avisos.add(llave);
    return Promise.resolve(true);
  }

  limpiarRetencion() {
    const ahora = this.ahora().getTime();
    this.datos.historial = this.datos.historial.filter((h) => ahora - h.creado < 48 * 3_600_000);
    this.datos.auditoria = this.datos.auditoria.filter(
      (a) => ahora - a.fecha.getTime() < 90 * 86_400_000,
    );
    for (const p of this.datos.pendientes)
      if (p.estado === "pendiente" && p.vence.getTime() < ahora) p.estado = "vencida";
    return Promise.resolve();
  }
}
