import { describe, expect, it } from "vitest";
import { redactarDatosPersonales, redactarSecretos } from "./redaccion.js";

// Los secretos falsos se arman en tiempo de ejecución para que el escaneo de secretos no los marque.
const pit = "pit-" + "1a2b3c4d-".repeat(4);
const anthropic = "sk-" + "ant-" + "x".repeat(30);
const telegram = "123456789:" + "A".repeat(35);

describe("redactarSecretos", () => {
  it("oculta PIT, API keys y tokens de Telegram", () => {
    const texto = `pit=${pit} key=${anthropic} bot=${telegram}`;
    const limpio = redactarSecretos(texto);
    expect(limpio).not.toContain(pit);
    expect(limpio).not.toContain(anthropic);
    expect(limpio).not.toContain(telegram);
  });

  it("conserva el prefijo Bearer", () => {
    expect(redactarSecretos("Authorization: Bearer abc.def")).toBe(
      "Authorization: Bearer [REDACTADO]",
    );
  });

  it("no altera texto sin secretos", () => {
    expect(redactarSecretos("Contacto creado en prueba")).toBe("Contacto creado en prueba");
  });
});

describe("redactarDatosPersonales", () => {
  it("oculta emails, IP y teléfonos", () => {
    const limpio = redactarDatosPersonales(
      "ana@ejemplo.com desde 190.12.4.8 llamó al +593 99 123 4567 y al 099-123-4567",
    );
    expect(limpio).not.toMatch(/ana@|190\.12|593|123/);
  });

  it("no toca fechas, marcas de tiempo ni IDs", () => {
    const texto = "2026-10-22T15:00:00Z 1761145200000 ehUUL7hTUw9OKhLo06Ba";
    expect(redactarDatosPersonales(texto)).toBe(texto);
  });
});
