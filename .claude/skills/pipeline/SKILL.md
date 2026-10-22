---
name: pipeline
description: Análisis de pipelines de GHL con valor total, cantidad por etapa, conversión entre etapas y oportunidades estancadas más de 7 días. Úsalo para "cómo va el pipeline", "embudo" o "oportunidades estancadas".
argument-hint: "[días estancada] [subcuenta]"
allowed-tools: mcp__ghl-api__resumen_pipeline mcp__ghl-api__subcuenta_activa
---

Analiza los pipelines de la subcuenta con `ghl-api`.

Argumentos: "$ARGUMENTS". Un número cambia los días para considerar una oportunidad estancada
(7 por defecto). Un alias se pasa en `subcuenta`.

1. Llama a `resumen_pipeline` con `diasEstancada`.
2. Por cada pipeline con datos muestra:
   - Valor abierto, abiertas, ganadas (y su valor), perdidas y abandonadas.
   - Tabla por etapa: etapa, cantidad, valor.
   - Conversión entre etapas en porcentaje. Aclara una vez que es aproximada: GHL no guarda el
     historial de etapas, se calcula con la posición actual y las ganadas.
   - Estancadas: total y las 10 con más días (nombre, etapa, días, valor).
3. Omite los pipelines vacíos en una sola línea al final.
4. Cierra con el cuello de botella principal y 2 acciones para destrabarlo.
