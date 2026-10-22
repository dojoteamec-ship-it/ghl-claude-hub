import { z } from "zod";
import { definirLectura } from "../operacion.js";
import { aDia, campo, fecha, lista, numero, texto } from "./comun.js";

const rango = {
  desde: fecha.optional(),
  hasta: fecha.optional(),
  limite: z.number().int().min(1).max(100).default(20),
  desplazamiento: z.number().int().min(0).default(0),
};

const dia = (valor: string | number | undefined) => (valor === undefined ? undefined : aDia(valor));

/** Movimiento de pago proyectado, sin datos del pagador. */
export interface Movimiento {
  id: string;
  nombre: string | undefined;
  estado: string | undefined;
  monto: number | undefined;
  moneda: string | undefined;
  contactId: string | undefined;
  fecha: string | undefined;
}

const proyectarMovimiento = (crudo: unknown): Movimiento => ({
  id: String(campo(crudo, "_id") ?? campo(crudo, "id") ?? ""),
  nombre: texto(campo(crudo, "name")) ?? texto(campo(crudo, "title")),
  estado: texto(campo(crudo, "status")),
  monto: numero(campo(crudo, "amount")) ?? numero(campo(crudo, "total")),
  moneda: texto(campo(crudo, "currency")),
  contactId: texto(campo(crudo, "contactId")),
  fecha: texto(campo(crudo, "createdAt")) ?? texto(campo(crudo, "issueDate")),
});

export const listarTransacciones = definirLectura({
  nombre: "listarTransacciones",
  descripcion: "Transacciones de pago de la subcuenta.",
  entrada: z.object({ ...rango, contactId: z.string().optional() }),
  async ejecutar(ctx, e) {
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: "/payments/transactions",
      query: {
        altId: ctx.subcuenta.locationId,
        altType: "location",
        locationId: ctx.subcuenta.locationId,
        startAt: dia(e.desde),
        endAt: dia(e.hasta),
        contactId: e.contactId,
        limit: e.limite,
        offset: e.desplazamiento,
      },
    });
    return {
      transacciones: lista(campo(respuesta, "data")).map(proyectarMovimiento),
      total: Number(campo(respuesta, "totalCount") ?? 0),
    };
  },
});

export const listarOrdenes = definirLectura({
  nombre: "listarOrdenes",
  descripcion: "Órdenes de compra de la subcuenta.",
  entrada: z.object({
    ...rango,
    estadoPago: z.enum(["paid", "unpaid", "refunded", "partially_paid"]).optional(),
    contactId: z.string().optional(),
  }),
  async ejecutar(ctx, e) {
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: "/payments/orders",
      query: {
        altId: ctx.subcuenta.locationId,
        altType: "location",
        locationId: ctx.subcuenta.locationId,
        startAt: dia(e.desde),
        endAt: dia(e.hasta),
        paymentStatus: e.estadoPago,
        contactId: e.contactId,
        limit: e.limite,
        offset: e.desplazamiento,
      },
    });
    return {
      ordenes: lista(campo(respuesta, "data")).map(proyectarMovimiento),
      total: Number(campo(respuesta, "totalCount") ?? 0),
    };
  },
});

export const listarFacturas = definirLectura({
  nombre: "listarFacturas",
  descripcion: "Facturas de la subcuenta.",
  entrada: z.object({
    ...rango,
    estado: z.string().optional().describe("Estado: draft, sent, paid, void, etc."),
    contactId: z.string().optional(),
  }),
  async ejecutar(ctx, e) {
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: "/invoices/",
      query: {
        altId: ctx.subcuenta.locationId,
        altType: "location",
        startAt: dia(e.desde),
        endAt: dia(e.hasta),
        status: e.estado,
        contactId: e.contactId,
        limit: String(e.limite),
        offset: String(e.desplazamiento),
      },
    });
    return {
      facturas: lista(campo(respuesta, "invoices")).map(proyectarMovimiento),
      total: Number(campo(respuesta, "total") ?? 0),
    };
  },
});

export const listarProductos = definirLectura({
  nombre: "listarProductos",
  descripcion: "Productos de la subcuenta.",
  entrada: z.object({
    texto: z.string().optional(),
    limite: rango.limite,
    desplazamiento: rango.desplazamiento,
  }),
  async ejecutar(ctx, e) {
    const respuesta = await ctx.cliente.peticion<unknown>({
      metodo: "GET",
      ruta: "/products/",
      query: {
        locationId: ctx.subcuenta.locationId,
        search: e.texto,
        limit: e.limite,
        offset: e.desplazamiento,
      },
    });
    return {
      productos: lista(campo(respuesta, "products")).map((p) => ({
        id: String(campo(p, "_id") ?? campo(p, "id") ?? ""),
        nombre: texto(campo(p, "name")),
        tipo: texto(campo(p, "productType")),
        descripcion: texto(campo(p, "description")),
      })),
    };
  },
});

export const operacionesPagos = [
  listarTransacciones,
  listarOrdenes,
  listarFacturas,
  listarProductos,
];
