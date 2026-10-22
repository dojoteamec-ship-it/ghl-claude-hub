---
name: auditoria
description: Auditoría de salud de una subcuenta de GHL con puntaje de 0 a 100 y prioridades (contactos sin tag, duplicados probables, campos clave vacíos, oportunidades sin responsable, tags casi duplicados). Úsalo para "auditoría", "salud de la cuenta" o "qué está desordenado".
argument-hint: "[subcuenta]"
allowed-tools: mcp__ghl-api__auditoria_subcuenta mcp__ghl-api__subcuenta_activa
---

Audita la subcuenta con `ghl-api`.

Si "$ARGUMENTS" trae un alias, pásalo en `subcuenta`; si no, usa la activa.

1. Llama a `auditoria_subcuenta`.
2. Muestra:
   - **Puntaje** y calificación (buena, regular o mala), y cuántos contactos se revisaron de
     cuántos hay.
   - **Prioridades** en tabla: prioridad, problema, cantidad, porcentaje.
   - Para cada prioridad alta, una explicación de una línea de por qué importa para vender.
3. Cierra con el orden recomendado de limpieza y sugiere correr `/limpieza` para ejecutarla
   primero en simulación.

No muestres emails ni teléfonos; usa nombres e IDs.
