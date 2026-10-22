import { ClienteGhl, type Registrador, configuracionApi } from "@ghl-hub/ghl-core";
import { cambiarSubcuenta, resolverAcceso } from "./acceso.js";
import { type ArchivoAdjunto, type LlamarModelo, responder } from "./agente.js";
import type { Almacen, SubcuentaBot, UsuarioBot } from "./almacen/tipos.js";
import { descifrar } from "./cifrado.js";
import { cancelarAccion, confirmarAccion } from "./confirmaciones.js";
import { registrarConsumo, revisarTopes } from "./costos.js";
import { fechaLocal } from "./fechas.js";
import { type HerramientaBot, construirHerramientas } from "./herramientas.js";
import { elegirModelo } from "./modelos.js";
import { aSubcuentaCore } from "./proveedor.js";

export interface Boton {
  texto: string;
  datos: string;
}

/** Lo que el bot envía: texto, botones o un archivo. paraAdmin va al chat del admin. */
export interface Salida {
  texto?: string;
  botones?: Boton[][];
  archivo?: ArchivoAdjunto;
  paraAdmin?: boolean;
}

export interface Remitente {
  telegramId: number;
  chatId: number;
  chatPrivado: boolean;
}

export interface DependenciasServicio {
  almacen: Almacen;
  clavePit: Buffer;
  llamarModelo: LlamarModelo;
  registrador?: Registrador;
  /** Se inyecta en pruebas para no llamar a GHL. */
  crearCliente?: (token: string, subcuenta: SubcuentaBot) => ClienteGhl;
  ahora?: () => Date;
}

const TURNOS_DE_HISTORIAL = 8;

export const AYUDA = `Te ayudo con tu subcuenta de GoHighLevel. Escríbeme o mándame una nota de voz, por ejemplo:
- "¿Qué leads entraron hoy?"
- "Briefing del día"
- "¿Cómo va el pipeline?"
- "Busca a Ana Pérez y agrégale el tag cliente_vip"
- "¿A quién no le hemos respondido?"

Antes de cambiar algo en GHL te muestro el detalle con botones para confirmar o cancelar.

Comandos: /yo, /cancelar, /ayuda.`;

const AYUDA_ADMIN = `\n\nComo admin también tienes /subcuenta para cambiar de subcuenta y /uso para ver los costos.`;

const NO_AUTORIZADO =
  "No estás autorizado para usar este bot. Si crees que es un error, escribe a la agencia.";

export class ServicioBot {
  private readonly herramientas: HerramientaBot[] = construirHerramientas();
  private readonly clientes = new Map<string, ClienteGhl>();

  constructor(private readonly d: DependenciasServicio) {}

  private ahora() {
    return this.d.ahora?.() ?? new Date();
  }

  async clientePara(subcuenta: SubcuentaBot): Promise<ClienteGhl> {
    const clave = `${subcuenta.id}:${subcuenta.pitCifrado.slice(-12)}`;
    let cliente = this.clientes.get(clave);
    if (!cliente) {
      const token = descifrar(subcuenta.pitCifrado, this.d.clavePit);
      cliente =
        this.d.crearCliente?.(token, subcuenta) ??
        new ClienteGhl({
          token,
          ...configuracionApi(),
          ...(this.d.registrador ? { registrador: this.d.registrador } : {}),
        });
      this.clientes.set(clave, cliente);
    }
    return Promise.resolve(cliente);
  }

  private async acceso(r: Remitente) {
    const acceso = await resolverAcceso(this.d.almacen, r);
    if (acceso.ok) return acceso;
    const texto =
      acceso.motivo === "chat_no_privado"
        ? "Por seguridad solo respondo en chats privados."
        : acceso.motivo === "sin_subcuenta"
          ? "Tu usuario no tiene una subcuenta activa asignada. Escribe a la agencia."
          : NO_AUTORIZADO;
    return { ok: false as const, salidas: [{ texto }] };
  }

  /** Devuelve las salidas de rechazo si el remitente no puede usar el bot, o null si puede. */
  async rechazo(r: Remitente): Promise<Salida[] | null> {
    const acceso = await this.acceso(r);
    return acceso.ok ? null : acceso.salidas;
  }

  /** Un mensaje de texto (o la transcripción de una nota de voz). */
  async mensaje(r: Remitente, texto: string): Promise<Salida[]> {
    const acceso = await this.acceso(r);
    if (!acceso.ok) return acceso.salidas;
    const { usuario, subcuenta } = acceso;

    const topes = await revisarTopes(this.d.almacen, subcuenta, usuario, this.ahora());
    if (!topes.permitido) return [{ texto: `${topes.motivo} Se reinicia mañana.` }];

    const historial = await this.d.almacen.historial(r.chatId, subcuenta.id, TURNOS_DE_HISTORIAL);
    const resultado = await responder(
      {
        llamarModelo: this.d.llamarModelo,
        herramientas: this.herramientas,
        ghl: { cliente: await this.clientePara(subcuenta), subcuenta: aSubcuentaCore(subcuenta) },
        almacen: this.d.almacen,
        usuario,
        subcuenta,
        chatId: r.chatId,
        ahora: () => this.ahora(),
      },
      { texto, historial, modelo: elegirModelo(texto) },
    );

    await this.d.almacen.agregarHistorial(r.chatId, subcuenta.id, [
      { rol: "user", contenido: texto },
      { rol: "assistant", contenido: resultado.texto },
    ]);
    const avisos = await registrarConsumo(this.d.almacen, {
      subcuenta,
      usuario,
      consumoPorModelo: resultado.consumoPorModelo,
      ahora: this.ahora(),
    });
    await this.d.almacen.auditar({
      usuarioId: usuario.id,
      telegramId: usuario.telegramId,
      subcuentaId: subcuenta.id,
      accion: "consulta",
      parametros: {
        modelo: resultado.modelo,
        escalado: resultado.escalado,
        herramientas: resultado.herramientas,
        costoUsd: Number(resultado.consumo.costoUsd.toFixed(6)),
      },
      resultado: resultado.pendientes.length ? `pendientes:${resultado.pendientes.length}` : "ok",
    });

    const salidas: Salida[] = [{ texto: resultado.texto }];
    for (const accion of resultado.pendientes) {
      salidas.push({
        texto: `Confirma esta acción (vence en 10 minutos):\n\n${accion.resumen}`,
        botones: [
          [
            { texto: "Confirmar", datos: `c:${accion.id}` },
            { texto: "Cancelar", datos: `x:${accion.id}` },
          ],
        ],
      });
    }
    for (const archivo of resultado.archivos) salidas.push({ archivo });
    for (const aviso of avisos) salidas.push({ texto: aviso, paraAdmin: true });
    return salidas;
  }

  /** Comandos que empiezan con "/". */
  async comando(r: Remitente, nombre: string): Promise<Salida[]> {
    const acceso = await this.acceso(r);
    if (!acceso.ok) return acceso.salidas;
    const { usuario, subcuenta, disponibles } = acceso;
    const esAdmin = usuario.rol === "admin";

    switch (nombre) {
      case "start":
        return [
          {
            texto: `Hola, ${usuario.nombre}. Estás en "${subcuenta.nombre}".\n\n${AYUDA}${esAdmin ? AYUDA_ADMIN : ""}`,
          },
        ];
      case "ayuda":
        return [{ texto: AYUDA + (esAdmin ? AYUDA_ADMIN : "") }];
      case "yo":
        return [
          {
            texto: `${usuario.nombre} (${esAdmin ? "admin" : "cliente"})\nSubcuenta: ${subcuenta.alias} (${subcuenta.nombre}, ${subcuenta.entorno})\nTu ID de Telegram: ${usuario.telegramId}`,
          },
        ];
      case "cancelar": {
        const n = await this.d.almacen.cancelarPendientesDelChat(r.chatId);
        await this.d.almacen.borrarHistorial(r.chatId);
        return [
          {
            texto: `${n ? `Cancelé ${n} acción(es) pendiente(s). ` : "No había acciones pendientes. "}Empezamos de cero.`,
          },
        ];
      }
      case "subcuenta":
        if (!esAdmin) return [{ texto: "Ese comando es solo para el admin." }];
        return [
          {
            texto: `Subcuenta activa: ${subcuenta.alias} (${subcuenta.entorno}). Elige otra:`,
            botones: disponibles.map((s) => [
              {
                texto: `${s.id === subcuenta.id ? "✓ " : ""}${s.alias}${s.entorno === "produccion" ? " (producción)" : " (prueba)"}`,
                datos: `s:${s.id}`,
              },
            ]),
          },
        ];
      case "uso":
        return esAdmin
          ? [{ texto: await this.reporteUso(disponibles) }]
          : [{ texto: "Ese comando es solo para el admin." }];
      default:
        return [{ texto: "No conozco ese comando. Escribe /ayuda." }];
    }
  }

  private async reporteUso(disponibles: SubcuentaBot[]): Promise<string> {
    const hoy = fechaLocal(this.ahora());
    const hace7 = fechaLocal(new Date(this.ahora().getTime() - 6 * 86_400_000));
    const [deHoy, semana] = await Promise.all([
      this.d.almacen.usoPorSubcuenta(hoy, hoy),
      this.d.almacen.usoPorSubcuenta(hace7, hoy),
    ]);
    const lineas = disponibles.map((s) => {
      const h = deHoy.find((u) => u.subcuentaId === s.id);
      const w = semana.find((u) => u.subcuentaId === s.id);
      return `- ${s.alias}: hoy US$ ${(h?.costoUsd ?? 0).toFixed(4)} en ${h?.consultas ?? 0} consultas (tope US$ ${s.topeDiarioUsd.toFixed(2)}); 7 días US$ ${(w?.costoUsd ?? 0).toFixed(4)}`;
    });
    const total = semana.reduce((t, u) => t + u.costoUsd, 0);
    return `Uso del bot (Claude):\n${lineas.join("\n")}\n\nTotal 7 días: US$ ${total.toFixed(4)}`;
  }

  /** Toques en botones: c:<id> confirma, x:<id> cancela, s:<id> cambia de subcuenta. */
  async boton(r: Remitente, datos: string): Promise<Salida[]> {
    const acceso = await this.acceso(r);
    if (!acceso.ok) return acceso.salidas;
    const usuario: UsuarioBot = acceso.usuario;
    const [tipo, id = ""] = datos.split(":");
    if (tipo === "c") {
      const resultado = await confirmarAccion(
        { almacen: this.d.almacen, clientePara: (s) => this.clientePara(s) },
        { id, usuario, chatId: r.chatId, ahora: this.ahora() },
      );
      return [{ texto: resultado.mensaje }];
    }
    if (tipo === "x")
      return [
        {
          texto: (await cancelarAccion(this.d.almacen, { id, usuario, chatId: r.chatId })).mensaje,
        },
      ];
    if (tipo === "s") {
      const nueva = await cambiarSubcuenta(this.d.almacen, usuario, r.chatId, id);
      if (!nueva) return [{ texto: "No puedes usar esa subcuenta." }];
      await this.d.almacen.auditar({
        usuarioId: usuario.id,
        telegramId: usuario.telegramId,
        subcuentaId: nueva.id,
        accion: "cambiar_subcuenta",
        resultado: "ok",
      });
      const aviso =
        nueva.entorno === "produccion" ? " Es de PRODUCCIÓN: revisa bien cada confirmación." : "";
      return [{ texto: `Listo, ahora trabajas en "${nueva.alias}" (${nueva.nombre}).${aviso}` }];
    }
    return [{ texto: "Botón desconocido." }];
  }
}
