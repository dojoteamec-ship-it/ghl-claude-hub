import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actualizarContacto,
  agregarTags,
  borrarContacto,
  buscarContactos,
  crearContacto,
  obtenerContacto,
  quitarTags,
  type Contacto,
} from "./dominios/contactos.js";
import { obtenerSubcuenta } from "./dominios/configuracion.js";
import { ErrorGhl } from "./errores.js";
import { type ContextoOperacion, ejecutarOperacion, esSimulacion } from "./operacion.js";
import { contextoDePrueba, hayCredenciales } from "./pruebas/subcuenta-prueba.js";

/**
 * Ciclo completo de escritura en la subcuenta de prueba: crea PRUEBA-CLAUDE-<fecha>, lo actualiza,
 * le pone y quita un tag, y lo borra. Si algo falla a mitad, afterAll borra el contacto igual.
 */
const marca = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const nombre = `PRUEBA-CLAUDE-${marca}`;
const email = `prueba-claude-${marca.toLowerCase()}@ejemplo.com`;

let ctx: ContextoOperacion;
let token: string;
let registros: { evento: string }[];
let creado: Contacto | undefined;

describe.skipIf(!hayCredenciales())("ciclo de escritura en la subcuenta de prueba", () => {
  beforeAll(async () => {
    ({ ctx, token, registros } = await contextoDePrueba());
    // Seguro extra: la subcuenta real debe llamarse "... de Prueba".
    const datos = (await ejecutarOperacion(obtenerSubcuenta, ctx, {})) as { nombre?: string };
    if (!/prueba/i.test(datos.nombre ?? "")) {
      throw new Error("La subcuenta conectada no parece de prueba; no se escribe nada.");
    }
  });

  afterAll(async () => {
    if (creado) {
      await ejecutarOperacion(borrarContacto, ctx, { contactId: creado.id }).catch(() => undefined);
    }
  });

  it("simular no crea nada", async () => {
    const r = await ejecutarOperacion(crearContacto, ctx, {
      firstName: nombre,
      email,
      simular: true,
    });
    expect(esSimulacion(r)).toBe(true);
    const busqueda = (await ejecutarOperacion(buscarContactos, ctx, { texto: email })) as {
      total: number;
    };
    expect(busqueda.total).toBe(0);
  });

  it("crea el contacto con tag es_prueba", async () => {
    creado = (await ejecutarOperacion(crearContacto, ctx, {
      firstName: nombre,
      lastName: "Etapa3",
      email,
      tags: ["es_prueba"],
      source: "ghl-core integracion",
    })) as Contacto;
    expect(creado.id).toBeTruthy();
    expect(creado.tags).toContain("es_prueba");
  });

  it("lo actualiza y lo confirma leyendo por ID", async () => {
    if (!creado) throw new Error("No se creó el contacto.");
    await ejecutarOperacion(actualizarContacto, ctx, {
      contactId: creado.id,
      lastName: "Actualizado",
    });
    const leido = (await ejecutarOperacion(obtenerContacto, ctx, {
      contactId: creado.id,
    })) as Contacto;
    expect(leido.lastName).toBe("Actualizado");
  });

  it("le pone y le quita un tag", async () => {
    if (!creado) throw new Error("No se creó el contacto.");
    const con = (await ejecutarOperacion(agregarTags, ctx, {
      contactId: creado.id,
      tags: ["ghl-core-temporal"],
    })) as { tags: string[] };
    expect(con.tags).toContain("ghl-core-temporal");
    await ejecutarOperacion(quitarTags, ctx, { contactId: creado.id, tags: ["ghl-core-temporal"] });
    const leido = (await ejecutarOperacion(obtenerContacto, ctx, {
      contactId: creado.id,
    })) as Contacto;
    expect(leido.tags).not.toContain("ghl-core-temporal");
    expect(leido.tags).toContain("es_prueba");
  });

  it("lo borra y ya no existe por ID", async () => {
    if (!creado) throw new Error("No se creó el contacto.");
    const r = (await ejecutarOperacion(borrarContacto, ctx, { contactId: creado.id })) as {
      borrado: boolean;
    };
    expect(r.borrado).toBe(true);
    const error = await ejecutarOperacion(obtenerContacto, ctx, { contactId: creado.id }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorGhl);
    creado = undefined;
  });

  it("no deja el token en los logs", () => {
    expect(JSON.stringify(registros)).not.toContain(token);
  });
});
