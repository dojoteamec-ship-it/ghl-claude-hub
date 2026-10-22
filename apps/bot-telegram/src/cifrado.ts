import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/** Lee BOT_ENCRYPTION_KEY: 32 bytes en base64. */
export function claveDesdeBase64(base64: string): Buffer {
  const clave = Buffer.from(base64.trim(), "base64");
  if (clave.length !== 32) {
    throw new Error("BOT_ENCRYPTION_KEY debe ser de 32 bytes en base64.");
  }
  return clave;
}

/** Cifra con AES-256-GCM. Formato: v1.<iv>.<etiqueta>.<cifrado>, cada parte en base64url. */
export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave, iv);
  const cifrado = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return [VERSION, iv, etiqueta, cifrado]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function descifrar(paquete: string, clave: Buffer): string {
  const [version, iv, etiqueta, cifrado] = paquete.split(".");
  if (version !== VERSION || !iv || !etiqueta || cifrado === undefined) {
    throw new Error("El dato cifrado no tiene el formato esperado.");
  }
  const descifrador = createDecipheriv("aes-256-gcm", clave, Buffer.from(iv, "base64url"));
  descifrador.setAuthTag(Buffer.from(etiqueta, "base64url"));
  return Buffer.concat([
    descifrador.update(Buffer.from(cifrado, "base64url")),
    descifrador.final(),
  ]).toString("utf8");
}
