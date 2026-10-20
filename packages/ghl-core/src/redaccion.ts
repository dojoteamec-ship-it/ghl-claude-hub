const MARCA = "[REDACTADO]";

// Formatos de secretos que pueden aparecer en logs o mensajes de error.
const PATRONES: RegExp[] = [
  /pit-[A-Za-z0-9-]{8,}/g, // Private Integration Token de GHL
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // API key de Anthropic
  /sk-[A-Za-z0-9_-]{20,}/g, // API key de OpenAI
  /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, // token de bot de Telegram
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT (service role de Supabase)
  /(Bearer\s+)[^\s"']+/gi,
];

/** Reemplaza cualquier token, PIT o API key conocido por una marca fija. */
export function redactarSecretos(texto: string): string {
  return PATRONES.reduce(
    (acumulado, patron) =>
      acumulado.replace(patron, (_coincidencia, prefijo?: string) =>
        typeof prefijo === "string" ? `${prefijo}${MARCA}` : MARCA,
      ),
    texto,
  );
}
