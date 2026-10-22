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

const MARCA_PERSONAL = "[DATO_PERSONAL]";

// Datos personales que no deben quedar en logs: emails, IPv4 y teléfonos. Los patrones de teléfono
// exigen "+" o separadores para no confundir fechas ni marcas de tiempo.
const PATRONES_PERSONALES: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  /\+\d[\d\s().-]{6,}\d/g, // teléfono internacional (+593 99 123 4567)
  /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, // teléfono local con separadores (099 123 4567)
];

/** Oculta emails, IP y teléfonos. Para logs; no reemplaza la proyección de campos. */
export function redactarDatosPersonales(texto: string): string {
  return PATRONES_PERSONALES.reduce(
    (acumulado, patron) => acumulado.replace(patron, MARCA_PERSONAL),
    texto,
  );
}

/** Aplica las dos redacciones: secretos y datos personales. */
export function redactarTodo(texto: string): string {
  return redactarDatosPersonales(redactarSecretos(texto));
}
