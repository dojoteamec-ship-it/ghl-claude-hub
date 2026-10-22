/** Telegram admite 4096 caracteres por mensaje; se deja margen. */
export const MAXIMO_MENSAJE = 4000;

/** Divide un texto largo en partes, cortando por párrafos o líneas cuando se puede. */
export function dividirMensaje(texto: string, maximo = MAXIMO_MENSAJE): string[] {
  const partes: string[] = [];
  let resto = texto.trim();
  while (resto.length > maximo) {
    let corte = resto.lastIndexOf("\n\n", maximo);
    if (corte < maximo / 2) corte = resto.lastIndexOf("\n", maximo);
    if (corte < maximo / 2) corte = resto.lastIndexOf(" ", maximo);
    if (corte <= 0) corte = maximo;
    partes.push(resto.slice(0, corte).trimEnd());
    resto = resto.slice(corte).trimStart();
  }
  if (resto) partes.push(resto);
  return partes.length ? partes : ["(sin respuesta)"];
}
