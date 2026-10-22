import { redactarTodo } from "./redaccion.js";

export type NivelRegistro = "info" | "aviso" | "error";

/** Destino de los logs de ghl-core. Recibe texto ya redactado. */
export interface Registrador {
  registrar(nivel: NivelRegistro, evento: string, datos?: Record<string, unknown>): void;
}

/** No registra nada. Es el valor por defecto. */
export const registradorSilencioso: Registrador = { registrar: () => undefined };

/** Envuelve otro registrador y redacta secretos y datos personales antes de pasarle nada. */
export function registradorSeguro(destino: Registrador): Registrador {
  return {
    registrar(nivel, evento, datos) {
      const limpios =
        datos === undefined
          ? undefined
          : (JSON.parse(redactarTodo(JSON.stringify(datos))) as Record<string, unknown>);
      destino.registrar(nivel, redactarTodo(evento), limpios);
    },
  };
}

/** Registrador que escribe en stderr como JSON de una línea (stdout queda libre para MCP). */
export const registradorConsola: Registrador = registradorSeguro({
  registrar(nivel, evento, datos) {
    console.error(JSON.stringify({ momento: new Date().toISOString(), nivel, evento, ...datos }));
  },
});
