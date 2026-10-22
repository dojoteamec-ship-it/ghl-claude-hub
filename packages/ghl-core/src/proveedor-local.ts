import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { ErrorGhl } from "./errores.js";
import {
  type ProveedorSubcuentas,
  type Subcuenta,
  esquemaArchivoSubcuentas,
  variablePit,
} from "./subcuentas.js";

export interface OpcionesProveedorLocal {
  /** Ruta de config/subcuentas.json. */
  rutaSubcuentas: string;
  /** Ruta de .env.local. Si no existe, solo se usan las variables de entorno. */
  rutaEnv?: string;
  /** Variables de entorno del proceso; tienen prioridad sobre .env.local. */
  entorno?: Record<string, string | undefined>;
}

/** Lee las subcuentas de config/subcuentas.json y los PIT de .env.local o del entorno. */
export class ProveedorSubcuentasLocal implements ProveedorSubcuentas {
  private subcuentas: Subcuenta[] | undefined;
  private variables: Record<string, string | undefined> | undefined;

  constructor(private readonly opciones: OpcionesProveedorLocal) {}

  // Son async para que los errores de carga lleguen como promesas rechazadas.
  async listar(): Promise<Subcuenta[]> {
    return [...this.cargarSubcuentas()];
  }

  async obtener(alias: string): Promise<Subcuenta> {
    const subcuenta = this.cargarSubcuentas().find((s) => s.alias === alias);
    if (!subcuenta) {
      throw new ErrorGhl({ tipo: "configuracion", detalle: `No existe la subcuenta "${alias}".` });
    }
    return subcuenta;
  }

  async obtenerToken(alias: string): Promise<string> {
    await this.obtener(alias);
    const nombre = variablePit(alias);
    const token = this.cargarVariables()[nombre]?.trim();
    if (!token) {
      throw new ErrorGhl({ tipo: "configuracion", detalle: `Falta la variable ${nombre}.` });
    }
    return token;
  }

  private cargarSubcuentas(): Subcuenta[] {
    if (this.subcuentas) return this.subcuentas;
    const { rutaSubcuentas } = this.opciones;
    if (!existsSync(rutaSubcuentas)) {
      throw new ErrorGhl({
        tipo: "configuracion",
        detalle: "No existe config/subcuentas.json. Cópialo de config/subcuentas.example.json.",
      });
    }
    let contenido: unknown;
    try {
      contenido = JSON.parse(readFileSync(rutaSubcuentas, "utf8"));
    } catch {
      throw new ErrorGhl({
        tipo: "configuracion",
        detalle: "config/subcuentas.json no es JSON válido.",
      });
    }
    const resultado = esquemaArchivoSubcuentas.safeParse(contenido);
    if (!resultado.success) {
      const problemas = resultado.error.issues.map((i) => i.message).join("; ");
      throw new ErrorGhl({
        tipo: "configuracion",
        detalle: `config/subcuentas.json: ${problemas}`,
      });
    }
    this.subcuentas = resultado.data.subcuentas;
    return this.subcuentas;
  }

  private cargarVariables(): Record<string, string | undefined> {
    if (this.variables) return this.variables;
    const { rutaEnv, entorno = process.env } = this.opciones;
    const delArchivo =
      rutaEnv && existsSync(rutaEnv) ? parseEnv(readFileSync(rutaEnv, "utf8")) : {};
    this.variables = { ...delArchivo, ...entorno };
    return this.variables;
  }
}

/** Proveedor con subcuentas y tokens en memoria. Útil en pruebas y en entornos sin archivos. */
export class ProveedorSubcuentasMemoria implements ProveedorSubcuentas {
  constructor(private readonly entradas: readonly { subcuenta: Subcuenta; token: string }[]) {}

  listar(): Promise<Subcuenta[]> {
    return Promise.resolve(this.entradas.map((e) => e.subcuenta));
  }

  obtener(alias: string): Promise<Subcuenta> {
    const entrada = this.entradas.find((e) => e.subcuenta.alias === alias);
    return entrada
      ? Promise.resolve(entrada.subcuenta)
      : Promise.reject(
          new ErrorGhl({ tipo: "configuracion", detalle: `No existe la subcuenta "${alias}".` }),
        );
  }

  async obtenerToken(alias: string): Promise<string> {
    await this.obtener(alias);
    const entrada = this.entradas.find((e) => e.subcuenta.alias === alias);
    return entrada?.token ?? "";
  }
}
