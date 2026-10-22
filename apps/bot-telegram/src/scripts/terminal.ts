import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

/** Preguntas en la terminal; las ocultas no muestran lo que se escribe ni con entrada canalizada. */
export function crearTerminal() {
  const esTerminal = Boolean(stdin.isTTY);
  const rl = createInterface({ input: stdin, output: stdout, terminal: esTerminal });
  const lineas = rl[Symbol.asyncIterator]();
  let oculto = false;
  const interna = rl as unknown as { _writeToOutput?: (t: string) => void };
  const escribir = interna._writeToOutput?.bind(rl);
  interna._writeToOutput = (t: string) => {
    if (!oculto && escribir) escribir(t);
  };
  const leer = async (texto: string, ocultar = false) => {
    stdout.write(texto);
    oculto = ocultar;
    const { value } = await lineas.next();
    oculto = false;
    if (ocultar || !esTerminal) stdout.write("\n");
    return String(value ?? "").trim();
  };
  return {
    preguntar: (texto: string) => leer(texto),
    preguntarOculto: (texto: string) => leer(texto, true),
    cerrar: () => rl.close(),
  };
}

export function salir(mensaje: string): never {
  console.error(mensaje);
  process.exit(1);
}
