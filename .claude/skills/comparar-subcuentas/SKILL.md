---
name: comparar-subcuentas
description: Compara lado a lado las subcuentas de GHL configuradas en ghl-api con leads nuevos, oportunidades abiertas y ganadas con su valor, conversaciones sin responder y, si se pide, el puntaje de auditoría. Úsalo para "compara mis clientes" o "cómo van las subcuentas".
argument-hint: "[días] [con auditoría]"
allowed-tools: mcp__ghl-api__comparar_subcuentas mcp__ghl-api__listar_subcuentas
---

Compara las subcuentas con `comparar_subcuentas` de `ghl-api`.

Argumentos: "$ARGUMENTS". Un número cambia la ventana de leads nuevos (7 días por defecto). Si
dice "auditoría", usa `incluirAuditoria: true` (tarda más).

1. Llama a `comparar_subcuentas`.
2. Muestra una tabla con una fila por subcuenta y estas columnas: alias, entorno, leads nuevos,
   oportunidades abiertas, valor abierto, ganadas, valor ganado, sin responder y puntaje si lo hay.
3. Las subcuentas con error van en una línea aparte, con el motivo (por ejemplo, falta su PIT en
   `.env.local`).
4. Cierra con 3 observaciones: la subcuenta que más crece, la que más necesita atención y por qué.

Solo se comparan las subcuentas configuradas en `config/subcuentas.json`.
