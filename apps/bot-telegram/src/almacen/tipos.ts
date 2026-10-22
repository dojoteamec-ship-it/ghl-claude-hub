import type { Entorno } from "@ghl-hub/ghl-core";
import type { Consumo, ModeloBot } from "../modelos.js";

export type Rol = "admin" | "cliente";

export interface SubcuentaBot {
  id: string;
  alias: string;
  nombre: string;
  locationId: string;
  entorno: Entorno;
  pitCifrado: string;
  topeDiarioUsd: number;
  activa: boolean;
}

export interface UsuarioBot {
  id: string;
  telegramId: number;
  nombre: string;
  rol: Rol;
  /** Obligatoria para clientes: es la única subcuenta que pueden usar. */
  subcuentaId: string | null;
  topeDiarioUsd: number;
  activo: boolean;
}

export type EstadoAccion = "pendiente" | "ejecutada" | "cancelada" | "vencida" | "fallida";

export interface AccionPendiente {
  id: string;
  chatId: number;
  usuarioId: string;
  subcuentaId: string;
  operacion: string;
  entrada: Record<string, unknown>;
  resumen: string;
  estado: EstadoAccion;
  vence: Date;
}

export interface TurnoHistorial {
  rol: "user" | "assistant";
  contenido: string;
}

export interface UsoDia extends Consumo {
  consultas: number;
}

export interface RegistroAuditoria {
  usuarioId?: string | null;
  telegramId: number;
  subcuentaId?: string | null;
  accion: string;
  tipo?: string;
  parametros?: Record<string, unknown>;
  resultado: string;
}

/**
 * Persistencia del bot. Supabase en producción y memoria en pruebas. Ninguna implementación
 * devuelve un PIT en claro: se descifra solo en el proveedor de subcuentas.
 */
export interface Almacen {
  subcuentas(): Promise<SubcuentaBot[]>;
  subcuentaPorId(id: string): Promise<SubcuentaBot | undefined>;
  guardarSubcuenta(datos: Omit<SubcuentaBot, "id">): Promise<SubcuentaBot>;

  usuarioPorTelegram(telegramId: number): Promise<UsuarioBot | undefined>;
  guardarUsuario(datos: Omit<UsuarioBot, "id">): Promise<UsuarioBot>;
  usuariosAdmin(): Promise<UsuarioBot[]>;

  /** Subcuentas que un admin puede usar. */
  accesosAdmin(usuarioId: string): Promise<string[]>;
  darAccesoAdmin(usuarioId: string, subcuentaId: string): Promise<void>;

  subcuentaActivaDelChat(chatId: number): Promise<string | undefined>;
  fijarSubcuentaDelChat(chatId: number, usuarioId: string, subcuentaId: string): Promise<void>;

  historial(chatId: number, subcuentaId: string, limite: number): Promise<TurnoHistorial[]>;
  agregarHistorial(chatId: number, subcuentaId: string, turnos: TurnoHistorial[]): Promise<void>;
  borrarHistorial(chatId: number): Promise<void>;

  crearPendiente(
    datos: Omit<AccionPendiente, "id" | "estado" | "vence">,
    minutos: number,
  ): Promise<AccionPendiente>;
  pendiente(id: string): Promise<AccionPendiente | undefined>;
  /** Cambia el estado solo si sigue pendiente; devuelve false si otro proceso ya la tomó. */
  resolverPendiente(id: string, estado: Exclude<EstadoAccion, "pendiente">): Promise<boolean>;
  /** Una acción ya tomada para ejecutar terminó con error. */
  marcarFallida(id: string): Promise<void>;
  cancelarPendientesDelChat(chatId: number): Promise<number>;

  auditar(registro: RegistroAuditoria): Promise<void>;

  registrarUso(
    fecha: string,
    subcuentaId: string,
    usuarioId: string,
    modelo: ModeloBot,
    consumo: Consumo,
  ): Promise<void>;
  usoDelDia(fecha: string, filtro: { subcuentaId?: string; usuarioId?: string }): Promise<UsoDia>;
  usoPorSubcuenta(desde: string, hasta: string): Promise<(UsoDia & { subcuentaId: string })[]>;
  /** Marca el aviso del 80 % para no repetirlo; devuelve true solo la primera vez del día. */
  marcarAviso(fecha: string, clave: string): Promise<boolean>;

  limpiarRetencion(): Promise<void>;
}
