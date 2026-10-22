---
name: subcuenta
description: Cambia la subcuenta activa de GHL en ghl-api y confirma cuál quedó. Úsalo cuando el usuario quiera trabajar con otra subcuenta o cliente.
argument-hint: "[alias]"
allowed-tools: mcp__ghl-api__listar_subcuentas mcp__ghl-api__seleccionar_subcuenta mcp__ghl-api__subcuenta_activa
---

Cambia la subcuenta activa de GHL.

Alias pedido: "$ARGUMENTS"

1. Si el alias está vacío, llama a `listar_subcuentas` de `ghl-api`, muestra una tabla corta
   (alias, nombre, entorno, activa) y pregunta cuál activar. No elijas por el usuario.
2. Si hay alias, llama a `seleccionar_subcuenta` con ese alias. Si no existe, muestra las
   disponibles con `listar_subcuentas`.
3. Confirma en una línea: alias, nombre y entorno. Si es de producción, avisa que las escrituras
   pedirán `confirmar: true` y tu confirmación en el chat.
4. Recuerda que la barra de estado muestra el cambio desde el próximo mensaje.
