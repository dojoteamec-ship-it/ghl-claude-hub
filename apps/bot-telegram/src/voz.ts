import OpenAI, { toFile } from "openai";

/**
 * Modelo de transcripción de OpenAI. gpt-transcribe es el recomendado desde 2026-08-26;
 * gpt-4o-mini-transcribe quedó obsoleto. Se puede cambiar con OPENAI_MODELO_TRANSCRIPCION.
 */
export const MODELO_TRANSCRIPCION = "gpt-transcribe";

export type Transcribir = (audio: Buffer, nombre: string) => Promise<string>;

export function crearTranscriptor(apiKey: string, modelo = MODELO_TRANSCRIPCION): Transcribir {
  const cliente = new OpenAI({ apiKey });
  return async (audio, nombre) => {
    const respuesta = await cliente.audio.transcriptions.create({
      file: await toFile(audio, nombre),
      model: modelo,
      // gpt-transcribe usa "languages" en lugar de "language".
      languages: ["es"],
      prompt:
        "Nota de voz para un asistente de GoHighLevel (GHL): contactos, oportunidades, pipeline, citas, tags.",
    });
    return respuesta.text.trim();
  };
}
