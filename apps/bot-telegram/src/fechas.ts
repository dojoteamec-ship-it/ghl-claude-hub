/** Fecha YYYY-MM-DD en la zona del negocio (Ecuador por defecto). Es la clave de uso_diario. */
export function fechaLocal(momento = new Date(), zona = "America/Guayaquil"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(momento);
}
