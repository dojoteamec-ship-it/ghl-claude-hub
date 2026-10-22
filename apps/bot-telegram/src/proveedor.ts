import { ErrorGhl, type ProveedorSubcuentas, type Subcuenta } from "@ghl-hub/ghl-core";
import type { Almacen, SubcuentaBot } from "./almacen/tipos.js";
import { descifrar } from "./cifrado.js";

export const aSubcuentaCore = (s: SubcuentaBot): Subcuenta => ({
  alias: s.alias,
  nombre: s.nombre,
  locationId: s.locationId,
  entorno: s.entorno,
  notas: "",
});

/** ProveedorSubcuentas sobre el almacén del bot: descifra el PIT solo cuando hace falta. */
export class ProveedorSubcuentasAlmacen implements ProveedorSubcuentas {
  constructor(
    private readonly almacen: Almacen,
    private readonly clave: Buffer,
  ) {}

  async listar() {
    return (await this.almacen.subcuentas()).map(aSubcuentaCore);
  }

  private async porAlias(alias: string) {
    const s = (await this.almacen.subcuentas()).find((x) => x.alias === alias);
    if (!s)
      throw new ErrorGhl({ tipo: "configuracion", detalle: `No existe la subcuenta "${alias}".` });
    return s;
  }

  async obtener(alias: string) {
    return aSubcuentaCore(await this.porAlias(alias));
  }

  async obtenerToken(alias: string) {
    return descifrar((await this.porAlias(alias)).pitCifrado, this.clave);
  }
}
