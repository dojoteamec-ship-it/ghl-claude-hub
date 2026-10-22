import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Consumo, ModeloBot } from "../modelos.js";
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

type Fila = Record<string, unknown>;

const aSubcuenta = (f: Fila): SubcuentaBot => ({
  id: String(f.id),
  alias: String(f.alias),
  nombre: String(f.nombre),
  locationId: String(f.location_id),
  entorno: f.entorno === "produccion" ? "produccion" : "prueba",
  pitCifrado: String(f.pit_cifrado),
  topeDiarioUsd: Number(f.tope_diario_usd),
  activa: f.activa === true,
});

const aUsuario = (f: Fila): UsuarioBot => ({
  id: String(f.id),
  telegramId: Number(f.telegram_id),
  nombre: String(f.nombre),
  rol: f.rol === "admin" ? "admin" : "cliente",
  subcuentaId: f.subcuenta_id ? String(f.subcuenta_id) : null,
  topeDiarioUsd: Number(f.tope_diario_usd),
  activo: f.activo === true,
});

const aPendiente = (f: Fila): AccionPendiente => ({
  id: String(f.id),
  chatId: Number(f.chat_id),
  usuarioId: String(f.usuario_id),
  subcuentaId: String(f.subcuenta_id),
  operacion: String(f.operacion),
  entrada: (f.entrada ?? {}) as Record<string, unknown>,
  resumen: String(f.resumen),
  estado: f.estado as EstadoAccion,
  vence: new Date(String(f.vence)),
});

const aUso = (f: Fila): UsoDia => ({
  tokensEntrada: Number(f.tokens_entrada ?? 0),
  tokensSalida: Number(f.tokens_salida ?? 0),
  tokensCacheLectura: Number(f.tokens_cache_lectura ?? 0),
  tokensCacheEscritura: Number(f.tokens_cache_escritura ?? 0),
  costoUsd: Number(f.costo_usd ?? 0),
  consultas: Number(f.consultas ?? 0),
});

/** Error sin datos: los mensajes de Supabase pueden incluir valores de la fila. */
function revisar<T>(
  resultado: { data: T; error: { code?: string; message: string } | null },
  que: string,
): T {
  if (resultado.error)
    throw new Error(`Supabase: falló ${que} (${resultado.error.code ?? "sin código"}).`);
  return resultado.data;
}

/** Almacén sobre Supabase con la service role key. Solo corre en el servidor del bot. */
export class AlmacenSupabase implements Almacen {
  private readonly db: SupabaseClient;

  constructor(url: string, claveServicio: string) {
    this.db = createClient(url, claveServicio, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async subcuentas() {
    const filas = revisar(
      await this.db.from("subcuentas").select("*").eq("activa", true).order("alias"),
      "leer subcuentas",
    );
    return (filas as Fila[]).map(aSubcuenta);
  }

  async subcuentaPorId(id: string) {
    const fila = revisar(
      await this.db.from("subcuentas").select("*").eq("id", id).maybeSingle(),
      "leer subcuenta",
    );
    return fila ? aSubcuenta(fila as Fila) : undefined;
  }

  async guardarSubcuenta(d: Omit<SubcuentaBot, "id">) {
    const fila = revisar(
      await this.db
        .from("subcuentas")
        .upsert(
          {
            alias: d.alias,
            nombre: d.nombre,
            location_id: d.locationId,
            entorno: d.entorno,
            pit_cifrado: d.pitCifrado,
            tope_diario_usd: d.topeDiarioUsd,
            activa: d.activa,
          },
          { onConflict: "alias" },
        )
        .select()
        .single(),
      "guardar subcuenta",
    );
    return aSubcuenta(fila as Fila);
  }

  async usuarioPorTelegram(telegramId: number) {
    const fila = revisar(
      await this.db
        .from("usuarios")
        .select("*")
        .eq("telegram_id", telegramId)
        .eq("activo", true)
        .maybeSingle(),
      "leer usuario",
    );
    return fila ? aUsuario(fila as Fila) : undefined;
  }

  async guardarUsuario(d: Omit<UsuarioBot, "id">) {
    const fila = revisar(
      await this.db
        .from("usuarios")
        .upsert(
          {
            telegram_id: d.telegramId,
            nombre: d.nombre,
            rol: d.rol,
            subcuenta_id: d.subcuentaId,
            tope_diario_usd: d.topeDiarioUsd,
            activo: d.activo,
          },
          { onConflict: "telegram_id" },
        )
        .select()
        .single(),
      "guardar usuario",
    );
    return aUsuario(fila as Fila);
  }

  async usuariosAdmin() {
    const filas = revisar(
      await this.db.from("usuarios").select("*").eq("rol", "admin").eq("activo", true),
      "leer admins",
    );
    return (filas as Fila[]).map(aUsuario);
  }

  async accesosAdmin(usuarioId: string) {
    const filas = revisar(
      await this.db.from("accesos_admin").select("subcuenta_id").eq("usuario_id", usuarioId),
      "leer accesos",
    );
    return (filas as Fila[]).map((f) => String(f.subcuenta_id));
  }

  async darAccesoAdmin(usuarioId: string, subcuentaId: string) {
    revisar(
      await this.db
        .from("accesos_admin")
        .upsert(
          { usuario_id: usuarioId, subcuenta_id: subcuentaId },
          { onConflict: "usuario_id,subcuenta_id" },
        ),
      "dar acceso",
    );
  }

  async subcuentaActivaDelChat(chatId: number) {
    const fila = revisar(
      await this.db.from("estado_chat").select("subcuenta_id").eq("chat_id", chatId).maybeSingle(),
      "leer chat",
    );
    return fila ? String((fila as Fila).subcuenta_id) : undefined;
  }

  async fijarSubcuentaDelChat(chatId: number, usuarioId: string, subcuentaId: string) {
    revisar(
      await this.db.from("estado_chat").upsert({
        chat_id: chatId,
        usuario_id: usuarioId,
        subcuenta_id: subcuentaId,
        actualizado: new Date().toISOString(),
      }),
      "fijar subcuenta del chat",
    );
  }

  async historial(chatId: number, subcuentaId: string, limite: number): Promise<TurnoHistorial[]> {
    const filas = revisar(
      await this.db
        .from("historial")
        .select("rol, contenido")
        .eq("chat_id", chatId)
        .eq("subcuenta_id", subcuentaId)
        .order("id", { ascending: false })
        .limit(limite),
      "leer historial",
    );
    return (filas as Fila[]).reverse().map((f) => ({
      rol: f.rol === "assistant" ? "assistant" : "user",
      contenido: String(f.contenido),
    }));
  }

  async agregarHistorial(chatId: number, subcuentaId: string, turnos: TurnoHistorial[]) {
    if (turnos.length === 0) return;
    revisar(
      await this.db.from("historial").insert(
        turnos.map((t) => ({
          chat_id: chatId,
          subcuenta_id: subcuentaId,
          rol: t.rol,
          contenido: t.contenido,
        })),
      ),
      "guardar historial",
    );
  }

  async borrarHistorial(chatId: number) {
    revisar(await this.db.from("historial").delete().eq("chat_id", chatId), "borrar historial");
  }

  async crearPendiente(d: Omit<AccionPendiente, "id" | "estado" | "vence">, minutos: number) {
    const fila = revisar(
      await this.db
        .from("acciones_pendientes")
        .insert({
          chat_id: d.chatId,
          usuario_id: d.usuarioId,
          subcuenta_id: d.subcuentaId,
          operacion: d.operacion,
          entrada: d.entrada,
          resumen: d.resumen,
          vence: new Date(Date.now() + minutos * 60_000).toISOString(),
        })
        .select()
        .single(),
      "crear acción pendiente",
    );
    return aPendiente(fila as Fila);
  }

  async pendiente(id: string) {
    const fila = revisar(
      await this.db.from("acciones_pendientes").select("*").eq("id", id).maybeSingle(),
      "leer acción pendiente",
    );
    return fila ? aPendiente(fila as Fila) : undefined;
  }

  async resolverPendiente(id: string, estado: Exclude<EstadoAccion, "pendiente">) {
    const ok = revisar(
      await this.db.rpc("resolver_pendiente", { p_id: id, p_estado: estado }),
      "resolver acción",
    );
    return ok === true;
  }

  async marcarFallida(id: string) {
    revisar(
      await this.db.from("acciones_pendientes").update({ estado: "fallida" }).eq("id", id),
      "marcar fallida",
    );
  }

  async cancelarPendientesDelChat(chatId: number) {
    const filas = revisar(
      await this.db
        .from("acciones_pendientes")
        .update({ estado: "cancelada", entrada: {} })
        .eq("chat_id", chatId)
        .eq("estado", "pendiente")
        .select("id"),
      "cancelar acciones",
    );
    return (filas as Fila[]).length;
  }

  async auditar(r: RegistroAuditoria) {
    revisar(
      await this.db.from("auditoria").insert({
        usuario_id: r.usuarioId ?? null,
        telegram_id: r.telegramId,
        subcuenta_id: r.subcuentaId ?? null,
        accion: r.accion,
        tipo: r.tipo ?? null,
        parametros: r.parametros ?? {},
        resultado: r.resultado,
      }),
      "auditar",
    );
  }

  async registrarUso(
    fecha: string,
    subcuentaId: string,
    usuarioId: string,
    modelo: ModeloBot,
    c: Consumo,
  ) {
    revisar(
      await this.db.rpc("registrar_uso", {
        p_fecha: fecha,
        p_subcuenta: subcuentaId,
        p_usuario: usuarioId,
        p_modelo: modelo,
        p_entrada: c.tokensEntrada,
        p_salida: c.tokensSalida,
        p_cache_lectura: c.tokensCacheLectura,
        p_cache_escritura: c.tokensCacheEscritura,
        p_costo: c.costoUsd,
      }),
      "registrar uso",
    );
  }

  async usoDelDia(fecha: string, filtro: { subcuentaId?: string; usuarioId?: string }) {
    let consulta = this.db.from("uso_diario").select("*").eq("fecha", fecha);
    if (filtro.subcuentaId) consulta = consulta.eq("subcuenta_id", filtro.subcuentaId);
    if (filtro.usuarioId) consulta = consulta.eq("usuario_id", filtro.usuarioId);
    const filas = (revisar(await consulta, "leer uso") as Fila[]).map(aUso);
    return filas.reduce(
      (t, u) => ({
        tokensEntrada: t.tokensEntrada + u.tokensEntrada,
        tokensSalida: t.tokensSalida + u.tokensSalida,
        tokensCacheLectura: t.tokensCacheLectura + u.tokensCacheLectura,
        tokensCacheEscritura: t.tokensCacheEscritura + u.tokensCacheEscritura,
        costoUsd: t.costoUsd + u.costoUsd,
        consultas: t.consultas + u.consultas,
      }),
      {
        tokensEntrada: 0,
        tokensSalida: 0,
        tokensCacheLectura: 0,
        tokensCacheEscritura: 0,
        costoUsd: 0,
        consultas: 0,
      },
    );
  }

  async usoPorSubcuenta(desde: string, hasta: string) {
    const filas = revisar(
      await this.db.from("uso_diario").select("*").gte("fecha", desde).lte("fecha", hasta),
      "leer uso por subcuenta",
    ) as Fila[];
    const mapa = new Map<string, UsoDia & { subcuentaId: string }>();
    for (const f of filas) {
      const id = String(f.subcuenta_id);
      const u = aUso(f);
      const previo = mapa.get(id);
      mapa.set(
        id,
        previo
          ? {
              subcuentaId: id,
              tokensEntrada: previo.tokensEntrada + u.tokensEntrada,
              tokensSalida: previo.tokensSalida + u.tokensSalida,
              tokensCacheLectura: previo.tokensCacheLectura + u.tokensCacheLectura,
              tokensCacheEscritura: previo.tokensCacheEscritura + u.tokensCacheEscritura,
              costoUsd: previo.costoUsd + u.costoUsd,
              consultas: previo.consultas + u.consultas,
            }
          : { ...u, subcuentaId: id },
      );
    }
    return [...mapa.values()];
  }

  async marcarAviso(fecha: string, clave: string) {
    const resultado = await this.db.from("avisos").insert({ fecha, clave });
    if (resultado.error?.code === "23505") return false;
    revisar(resultado, "marcar aviso");
    return true;
  }

  async limpiarRetencion() {
    revisar(await this.db.rpc("limpiar_retencion"), "limpiar retención");
  }
}
