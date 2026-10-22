import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ClienteGhl,
  ProveedorSubcuentasMemoria,
  type Subcuenta,
  catalogo,
} from "@ghl-hub/ghl-core";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it } from "vitest";
import { EstadoActiva } from "./estado.js";
import { aSnake } from "./nombres.js";
import { crearServidor } from "./servidor.js";

const prueba: Subcuenta = {
  alias: "prueba",
  nombre: "Ronin de Prueba",
  locationId: "LOC_PRUEBA",
  entorno: "prueba",
  notas: "",
};
const cliente1: Subcuenta = {
  alias: "cliente1",
  nombre: "Cliente Uno",
  locationId: "LOC_CLIENTE1",
  entorno: "produccion",
  notas: "",
};

interface Llamada {
  alias: string;
  metodo: string;
  url: URL;
  cuerpo: unknown;
}

let llamadas: Llamada[];
let rutaActiva: string;

/** GHL falso: responde según la ruta y anota qué subcuenta hizo cada llamada. */
function crearCliente(_token: string, subcuenta: Subcuenta) {
  return new ClienteGhl({
    token: "falso",
    fetch: (url, init) => {
      const u = new URL(String(url));
      const cuerpo = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      llamadas.push({ alias: subcuenta.alias, metodo: init?.method ?? "GET", url: u, cuerpo });
      const datos =
        u.pathname === "/contacts/search"
          ? { contacts: [{ id: `C_${subcuenta.alias}`, firstName: subcuenta.nombre }], total: 1 }
          : u.pathname === "/contacts/"
            ? { contact: { id: "NUEVO", locationId: subcuenta.locationId } }
            : {};
      return Promise.resolve(new Response(JSON.stringify(datos), { status: 200 }));
    },
  });
}

async function conectar() {
  const servidor = () =>
    crearServidor({
      proveedor: new ProveedorSubcuentasMemoria([
        { subcuenta: prueba, token: "t1" },
        { subcuenta: cliente1, token: "t2" },
      ]),
      estado: new EstadoActiva(rutaActiva),
      crearCliente,
    });
  const manejador = createMcpHandler(servidor);
  const transporte = new StreamableHTTPClientTransport(new URL("http://prueba.local/mcp"), {
    fetch: (url, init) => manejador.fetch(new Request(url, init)),
  });
  const cliente = new Client(
    { name: "pruebas", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await cliente.connect(transporte);
  return cliente;
}

const textoDe = (r: { content?: unknown }) =>
  ((r.content as { type: string; text?: string }[] | undefined) ?? [])
    .map((c) => c.text ?? "")
    .join("\n");

beforeEach(() => {
  llamadas = [];
  rutaActiva = join(mkdtempSync(join(tmpdir(), "ghl-api-")), ".ghl", "activa.json");
});

describe("servidor ghl-api", () => {
  it("expone una herramienta por operación más las de contexto", async () => {
    const cliente = await conectar();
    const { tools } = await cliente.listTools();
    const nombres = tools.map((t) => t.name);
    expect(nombres).toEqual(
      expect.arrayContaining(["listar_subcuentas", "seleccionar_subcuenta", "subcuenta_activa"]),
    );
    for (const o of catalogo) expect(nombres).toContain(aSnake(o.nombre));
    expect(tools).toHaveLength(catalogo.length + 3);
  });

  it("marca lecturas, destructivas y sensibles como corresponde", async () => {
    const { tools } = await (await conectar()).listTools();
    const t = (n: string) => tools.find((x) => x.name === n);
    expect(t("buscar_contactos")?.annotations?.readOnlyHint).toBe(true);
    expect(t("borrar_contacto")?.annotations?.destructiveHint).toBe(true);
    expect(t("borrar_contacto")?._meta?.["anthropic/requiresUserInteraction"]).toBe(true);
    expect(t("enviar_mensaje")?._meta?.["anthropic/requiresUserInteraction"]).toBe(true);
    expect(t("crear_contacto")?._meta?.["anthropic/requiresUserInteraction"]).toBeUndefined();
    expect(t("crear_contacto")?.annotations?.readOnlyHint).toBe(false);
    expect(t("crear_contacto")?.inputSchema.properties).toHaveProperty("confirmar");
    expect(t("crear_contacto")?.inputSchema.properties).toHaveProperty("simular");
    expect(t("buscar_contactos")?.inputSchema.properties).toHaveProperty("subcuenta");
    expect(t("buscar_contactos")?.inputSchema.properties).not.toHaveProperty("locationId");
  });

  it("arranca en la subcuenta de prueba y cambia con seleccionar_subcuenta", async () => {
    const cliente = await conectar();
    expect(textoDe(await cliente.callTool({ name: "subcuenta_activa", arguments: {} }))).toContain(
      '"prueba"',
    );

    await cliente.callTool({ name: "buscar_contactos", arguments: {} });
    expect(llamadas.at(-1)?.cuerpo).toMatchObject({ locationId: "LOC_PRUEBA" });

    const r = await cliente.callTool({
      name: "seleccionar_subcuenta",
      arguments: { alias: "cliente1" },
    });
    expect(textoDe(r)).toContain("PRODUCCIÓN");
    expect(JSON.parse(readFileSync(rutaActiva, "utf8"))).toMatchObject({
      alias: "cliente1",
      entorno: "produccion",
    });
    expect(readFileSync(rutaActiva, "utf8")).not.toContain("LOC_CLIENTE1");

    const otra = await cliente.callTool({ name: "buscar_contactos", arguments: {} });
    expect(llamadas.at(-1)?.cuerpo).toMatchObject({ locationId: "LOC_CLIENTE1" });
    expect(textoDe(otra)).toContain("C_cliente1");

    const listado = textoDe(await cliente.callTool({ name: "listar_subcuentas", arguments: {} }));
    expect(JSON.parse(listado)).toContainEqual(
      expect.objectContaining({ alias: "cliente1", activa: true }),
    );
  });

  it("acepta subcuenta para una consulta puntual sin cambiar la activa", async () => {
    const cliente = await conectar();
    await cliente.callTool({ name: "buscar_contactos", arguments: { subcuenta: "cliente1" } });
    expect(llamadas.at(-1)?.alias).toBe("cliente1");
    expect(textoDe(await cliente.callTool({ name: "subcuenta_activa", arguments: {} }))).toContain(
      '"prueba"',
    );
  });

  it("en producción rechaza escribir sin confirmar: true, con un mensaje claro", async () => {
    const cliente = await conectar();
    const r = await cliente.callTool({
      name: "crear_contacto",
      arguments: { subcuenta: "cliente1", firstName: "X" },
    });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/producción.*confirmar: true/s);
    expect(llamadas).toHaveLength(0);

    const ok = await cliente.callTool({
      name: "crear_contacto",
      arguments: { subcuenta: "cliente1", firstName: "X", confirmar: true },
    });
    expect(ok.isError).toBeFalsy();
    expect(llamadas.at(-1)).toMatchObject({ alias: "cliente1", metodo: "POST" });
  });

  it("la simulación no llama a GHL y lo dice", async () => {
    const cliente = await conectar();
    const r = await cliente.callTool({
      name: "crear_contacto",
      arguments: { firstName: "Prueba", email: "prueba@ejemplo.com", simular: true },
    });
    expect(textoDe(r)).toMatch(/^SIMULACIÓN en "prueba"/);
    expect(llamadas).toHaveLength(0);
  });

  it("rechaza argumentos desconocidos como locationId", async () => {
    const cliente = await conectar();
    const r = await cliente.callTool({
      name: "buscar_contactos",
      arguments: { locationId: "OTRA" },
    });
    expect(r.isError).toBe(true);
    expect(llamadas).toHaveLength(0);
  });

  it("explica en español una subcuenta inexistente", async () => {
    const cliente = await conectar();
    const r = await cliente.callTool({
      name: "seleccionar_subcuenta",
      arguments: { alias: "nadie" },
    });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toContain('No existe la subcuenta "nadie"');
  });
});
