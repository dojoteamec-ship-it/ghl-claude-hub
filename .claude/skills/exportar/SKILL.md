---
name: exportar
description: Exporta a XLSX o CSV, en la carpeta exports/, datos de GHL como contactos, oportunidades, citas, conversaciones, auditoría o pipeline. Úsalo para "exporta", "pásame a Excel" o "descarga en CSV".
argument-hint: "[qué exportar] [xlsx|csv]"
allowed-tools: mcp__ghl-api__exportar mcp__ghl-api__subcuenta_activa
---

Exporta datos de GHL con la herramienta `exportar` de `ghl-api`.

Pedido: "$ARGUMENTS"

1. Traduce el pedido a una herramienta de lectura y sus argumentos. Ejemplos:
   - "contactos de la última semana": `buscar_contactos` con un filtro `dateAdded` `range`.
   - "contactos con el tag X": `buscar_contactos` con filtro `tags` `contains`.
   - "oportunidades abiertas": `buscar_oportunidades` con `todas: true`.
   - "estancadas": `oportunidades_sin_movimiento`.
   - "citas de la semana": `citas_por_rango`.
   - "auditoría" o "pipeline": `auditoria_subcuenta` o `resumen_pipeline`.
   - "sin respuesta": `leads_sin_respuesta`.
     Para listas largas de contactos usa `limite: 100`.
2. Formato: XLSX salvo que pidan CSV. Pon un `nombre` corto y claro, por ejemplo
   `contactos-ultima-semana`.
3. Llama a `exportar` y responde con la ruta del archivo, filas y columnas.
4. Recuerda que `exports/` está fuera de Git y que el archivo tiene datos personales: no lo
   compartas fuera del equipo.
