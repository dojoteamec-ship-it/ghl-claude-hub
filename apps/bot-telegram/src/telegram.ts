import { Bot, InlineKeyboard, InputFile } from "grammy";
import type { Context } from "grammy";
import { redactarTodo } from "@ghl-hub/ghl-core";
import { dividirMensaje } from "./salida.js";
import type { Remitente, Salida, ServicioBot } from "./servicio.js";
import type { Transcribir } from "./voz.js";

const COMANDOS = ["start", "ayuda", "yo", "subcuenta", "uso", "cancelar"] as const;

const remitente = (ctx: Context): Remitente | undefined =>
  ctx.from && ctx.chat
    ? { telegramId: ctx.from.id, chatId: ctx.chat.id, chatPrivado: ctx.chat.type === "private" }
    : undefined;

async function enviar(ctx: Context, bot: Bot, adminId: number, salidas: Salida[]) {
  for (const s of salidas) {
    if (s.paraAdmin) {
      if (s.texto) await bot.api.sendMessage(adminId, s.texto).catch(() => undefined);
      continue;
    }
    if (s.archivo) {
      await ctx.replyWithDocument(new InputFile(s.archivo.contenido, s.archivo.nombre));
      continue;
    }
    if (!s.texto) continue;
    const partes = dividirMensaje(s.texto);
    for (const [i, parte] of partes.entries()) {
      const ultima = i === partes.length - 1;
      const teclado =
        ultima && s.botones
          ? InlineKeyboard.from(
              s.botones.map((fila) => fila.map((b) => InlineKeyboard.text(b.texto, b.datos))),
            )
          : undefined;
      await ctx.reply(parte, teclado ? { reply_markup: teclado } : {});
    }
  }
}

/** Conecta el servicio con Telegram: comandos, texto, voz y botones. */
export function crearBot(opciones: {
  token: string;
  adminId: number;
  servicio: ServicioBot;
  transcribir?: Transcribir;
}): Bot {
  const bot = new Bot(opciones.token);
  const { servicio } = opciones;

  for (const nombre of COMANDOS) {
    bot.command(nombre, async (ctx) => {
      const r = remitente(ctx);
      if (r) await enviar(ctx, bot, opciones.adminId, await servicio.comando(r, nombre));
    });
  }

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
    const r = remitente(ctx);
    if (!r) return;
    // Se quitan los botones para que no se toquen dos veces.
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await enviar(ctx, bot, opciones.adminId, await servicio.boton(r, ctx.callbackQuery.data));
  });

  bot.on("message:text", async (ctx) => {
    const r = remitente(ctx);
    if (!r || ctx.message.text.startsWith("/")) return;
    await ctx.replyWithChatAction("typing");
    await enviar(ctx, bot, opciones.adminId, await servicio.mensaje(r, ctx.message.text));
  });

  bot.on(["message:voice", "message:audio"], async (ctx) => {
    const r = remitente(ctx);
    if (!r) return;
    if (!opciones.transcribir) {
      await ctx.reply("Las notas de voz no están activadas: falta OPENAI_API_KEY.");
      return;
    }
    // Primero se comprueba el acceso: no se transcribe nada de alguien no autorizado.
    const rechazo = await servicio.rechazo(r);
    if (rechazo) {
      await enviar(ctx, bot, opciones.adminId, rechazo);
      return;
    }
    await ctx.replyWithChatAction("typing");
    const archivo = await ctx.getFile();
    if (!archivo.file_path) {
      await ctx.reply("No pude descargar la nota de voz.");
      return;
    }
    const respuesta = await fetch(
      `https://api.telegram.org/file/bot${opciones.token}/${archivo.file_path}`,
    );
    const audio = Buffer.from(await respuesta.arrayBuffer());
    const texto = await opciones.transcribir(
      audio,
      archivo.file_path.split("/").pop() ?? "nota.oga",
    );
    if (!texto) {
      await ctx.reply("No entendí la nota de voz. ¿Me la escribes?");
      return;
    }
    await ctx.reply(`Entendí: "${texto}"`);
    await enviar(ctx, bot, opciones.adminId, await servicio.mensaje(r, texto));
  });

  bot.catch(async (error) => {
    console.error(
      redactarTodo(
        `bot: ${error.error instanceof Error ? error.error.message : String(error.error)}`,
      ),
    );
    await error.ctx
      .reply("Tuve un problema procesando tu mensaje. Intenta de nuevo en un momento.")
      .catch(() => undefined);
  });

  return bot;
}
