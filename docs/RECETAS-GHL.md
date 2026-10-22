# Recetas GHL

Pedidos frecuentes probados en la subcuenta de prueba "Ronin de Prueba": del 1 al 10 con la
conexión `ghl-oficial` (MCP oficial de GHL) y del 11 al 25 con el MCP propio `ghl-api` y sus
comandos. Cada receta indica la operación, los parámetros que
funcionaron y el resultado. No se registran datos personales.

Fecha de la prueba: 2026-10-22.

## Cómo se usan

1. `search_operations` con el pedido en lenguaje natural para encontrar el `operationId`.
2. `describe_operation` si la operación tiene cuerpo o los parámetros no son claros.
3. `execute_operation` con `locationId` (la conexión es multi-subcuenta, así que es obligatorio).

En los ejemplos, `<LOCATION_ID>` es el `locationId` de la subcuenta y `<AHORA_MS>` es la fecha en
milisegundos desde epoch.

## Resumen

| #   | Pedido                               | Operación                               | Resultado                      |
| --- | ------------------------------------ | --------------------------------------- | ------------------------------ |
| 1   | Los 5 contactos más recientes        | `search-contacts-advanced`              | Funcionó: 5 de 96              |
| 2   | Contactos creados en los últimos 7 d | `search-contacts-advanced`              | Funcionó: 12                   |
| 3   | Contactos con la etiqueta es_prueba  | `search-contacts-advanced`              | Funcionó: 1                    |
| 4   | Pipelines y sus etapas               | `get-pipelines`                         | Funcionó: 2 pipelines          |
| 5   | Oportunidades abiertas por etapa     | `search-opportunity` + `get-pipelines`  | Funcionó: 1 abierta            |
| 6   | Oportunidades sin movimiento en 14 d | `search-opportunity` + filtro propio    | Funcionó con filtro propio: 1  |
| 7   | Citas de los próximos 7 días         | `get-calendars` + `get-calendar-events` | Funcionó: 0 citas              |
| 8   | Calendarios de la subcuenta          | `get-calendars`                         | Funcionó: 5 (1 activo)         |
| 9   | Usuarios de la subcuenta             | `get-location` + `search-users`         | Funcionó al segundo intento: 2 |
| 10  | Últimas 5 conversaciones             | `search-conversation`                   | Funcionó: 5 de 85              |

## Recetas

### 1. Los 5 contactos más recientes

- **Operación:** `search-contacts-advanced` (POST `/contacts/search`, lectura).
- **Parámetros:**

  ```json
  { "body": { "sort": [{ "field": "dateAdded", "direction": "desc" }], "pageLimit": 5 } }
  ```

- **Resultado:** funcionó. Devolvió 5 contactos y `total: 96`.
- **Notas:** este endpoint usa `pageLimit`, no `limit`. Los campos van en camelCase.

### 2. Contactos creados en los últimos 7 días

- **Operación:** `search-contacts-advanced`.
- **Parámetros:**

  ```json
  {
    "body": {
      "filters": [
        {
          "field": "dateAdded",
          "operator": "range",
          "value": { "gte": "2026-10-15T00:00:00Z", "lte": "2026-10-22T23:59:59Z" }
        }
      ],
      "sort": [{ "field": "dateAdded", "direction": "desc" }],
      "pageLimit": 100
    }
  }
  ```

- **Resultado:** funcionó. `total: 12`.
- **Notas:** el operador `range` acepta fechas ISO 8601.

### 3. Contactos con la etiqueta "es_prueba"

- **Operación:** `search-contacts-advanced`.
- **Parámetros:**

  ```json
  {
    "body": {
      "filters": [{ "field": "tags", "operator": "contains", "value": ["es_prueba"] }],
      "pageLimit": 20
    }
  }
  ```

- **Resultado:** funcionó. `total: 1`.
- **Notas:** un contacto recién creado puede tardar unos segundos en aparecer en la búsqueda. Para
  confirmar una escritura, lee por ID con `get-contact`.

### 4. Pipelines y sus etapas

- **Operación:** `get-pipelines` (GET `/opportunities/pipelines`, lectura).
- **Parámetros:** ninguno además de `locationId`.
- **Resultado:** funcionó. 2 pipelines: "Marketing Pipeline" (6 etapas) y "PIPELINE ODONTOSONRISA"
  (5 etapas). Cada etapa trae `id`, `name`, `position` y `stageWinProbability`.

### 5. Oportunidades abiertas por etapa

- **Operación:** `search-opportunity` (GET `/opportunities/search`, lectura), y `get-pipelines` para
  traducir `pipelineStageId` a nombre de etapa.
- **Parámetros:**

  ```json
  { "query": { "status": "open", "limit": 100 } }
  ```

- **Resultado:** funcionó. 1 oportunidad abierta: "PIPELINE ODONTOSONRISA" → "NUEVO AGENDAMIENTO".
- **Notas:** la API no agrupa por etapa; el agrupado se hace en código. Para filtrar una etapa
  concreta existen `pipelineId` y `pipelineStageId`. Paginación con `startAfter` y `startAfterId`
  que vienen en `meta`.
- **Alternativa:** `search-opportunities-advanced` (POST) también funcionó, pero respondió con
  estado 201 aunque es lectura, y su descripción no expone filtros por estado.

### 6. Oportunidades sin movimiento en 14 días

- **Operación:** `search-opportunity` con `status: "open"` y filtro propio.
- **Parámetros:** los mismos de la receta 5.
- **Filtro propio:** quedarse con las oportunidades cuyo `lastStageChangeAt` (o `updatedAt`) sea
  anterior a hoy menos 14 días.
- **Resultado:** funcionó con filtro propio. 1 oportunidad sin movimiento (último cambio de etapa:
  2026-07-10).
- **Notas:** no encontré un parámetro de la API que filtre por inactividad. Hay que traer todas las
  abiertas, paginando, y filtrar en código.

### 7. Citas de los próximos 7 días

- **Operación:** `get-calendars` para obtener los `calendarId`, luego `get-calendar-events`
  (GET `/calendars/events`, lectura) por cada calendario.
- **Parámetros:**

  ```json
  {
    "query": {
      "calendarId": "<CALENDAR_ID>",
      "startTime": "<AHORA_MS>",
      "endTime": "<AHORA_MS + 7 días>"
    }
  }
  ```

- **Resultado:** funcionó. 0 citas en los 5 calendarios.
- **Notas:** exige `calendarId`, `userId` o `groupId`; no hay consulta global por subcuenta.
  `startTime` y `endTime` van en milisegundos desde epoch.

### 8. Calendarios de la subcuenta

- **Operación:** `get-calendars` (GET `/calendars/`, lectura).
- **Parámetros:** ninguno además de `locationId`.
- **Resultado:** funcionó. 5 calendarios, de los cuales 1 está activo (`isActive: true`).

### 9. Usuarios de la subcuenta

- **Operación:** `get-location` para obtener `companyId`, luego `search-users`
  (GET `/users/search`, lectura).
- **Parámetros:**

  ```json
  { "query": { "companyId": "<COMPANY_ID>", "locationId": "<LOCATION_ID>", "limit": 50 } }
  ```

- **Resultado:** funcionó al segundo intento. 2 usuarios (1 admin, 1 user).
- **Primer intento:** sin `companyId` falló con 422 (`companyId should not be empty`). El servidor
  MCP no lo inyecta.

### 10. Últimas 5 conversaciones

- **Operación:** `search-conversation` (GET `/conversations/search`, lectura).
- **Parámetros:**

  ```json
  { "query": { "limit": 5, "sort": "desc", "sortBy": "last_message_date" } }
  ```

- **Resultado:** funcionó. 5 conversaciones de `total: 85`.

## Recetas 11 a 25: comandos y MCP `ghl-api` (Etapa 5)

Probadas el 2026-10-22 en Ronin de Prueba, llamando por stdio al servidor `ghl-api`, igual que
Claude Code. Los comandos `/...` son las skills de `.claude/skills/`; cada uno usa la herramienta
indicada. Las rutas de `exports/` quedan en la carpeta del proyecto.

| #   | Pedido o comando                               | Herramienta                    | Resultado                                                                                                                                              |
| --- | ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 11  | /subcuenta prueba                              | `seleccionar_subcuenta`        | Funcionó: Subcuenta activa: "prueba" (Ronin de Prueba, prueba).                                                                                        |
| 12  | /briefing                                      | `resumen_briefing`             | Funcionó: leads nuevos 4, 1 etapas con abiertas, citas hoy 0, sin responder 49                                                                         |
| 13  | /briefing 72                                   | `resumen_briefing`             | Funcionó: leads nuevos 7, 1 etapas con abiertas, citas hoy 0, sin responder 49                                                                         |
| 14  | /pipeline                                      | `resumen_pipeline`             | Funcionó: Marketing Pipeline: 0 abiertas, estancadas 0; PIPELINE ODONTOSONRISA: 1 abiertas, estancadas 1                                               |
| 15  | /auditoria                                     | `auditoria_subcuenta`          | Funcionó: puntaje 64 (mala), 4 prioridades, 95 contactos revisados                                                                                     |
| 16  | /seguimiento 48                                | `leads_sin_respuesta`          | Funcionó: 41 leads sin respuesta más de 48 h                                                                                                           |
| 17  | /exportar contactos con el tag es_prueba       | `exportar`                     | Funcionó: Exporté 1 filas y 12 columnas de "prueba"                                                                                                    |
| 18  | /exportar contactos de la última semana en csv | `exportar`                     | Funcionó: Exporté 11 filas y 12 columnas de "prueba"                                                                                                   |
| 19  | /exportar la auditoría                         | `exportar`                     | Funcionó: Exporté 4 filas y 7 columnas de "prueba"                                                                                                     |
| 20  | /comparar-subcuentas                           | `comparar_subcuentas`          | Funcionó: prueba: 11 leads 7d, 1 abiertas, 49 sin responder; sin_token: error (La configuración de la subcuenta está incompleta. Detalle: Falta la va) |
| 21  | Oportunidades estancadas más de 30 días        | `oportunidades_sin_movimiento` | Funcionó: 1 oportunidades                                                                                                                              |
| 22  | Campos personalizados de contactos             | `listar_campos_personalizados` | Funcionó: 24 campos                                                                                                                                    |
| 23  | Envíos de formularios del último mes           | `envios_formularios`           | Funcionó: 3 envíos (total 3)                                                                                                                           |
| 24  | Tags definidos en la subcuenta                 | `listar_tags`                  | Funcionó: 20 tags                                                                                                                                      |
| 25  | Simular agregar un tag a Prueba Claude         | `agregar_tags`                 | Funcionó: SIMULACIÓN en "prueba" (prueba): no se ejecutó nada en GHL.                                                                                  |

Notas por receta:

- **11.** Cambia `.ghl/activa.json`; la barra de estado lo muestra desde el siguiente mensaje.
- **12.** Zona horaria tomada de la subcuenta (America/Bogota). "Sin responder" = último mensaje entrante.
- **13.** `horas: 72` amplía solo la ventana de leads nuevos.
- **14.** La conversión es aproximada: GHL no guarda el historial de etapas.
- **15.** Revisa todos los contactos con `searchAfter` (hasta 2000 por defecto).
- **16.** Ordena de la conversación más antigua a la más reciente; la skill redacta borradores sin enviar.
- **17.** XLSX validado con openpyxl y LibreOffice.
- **18.** CSV en UTF-8 con BOM, para que Excel muestre tildes y eñes.
- **19.** Exporta la lista de prioridades de la auditoría.
- **20.** Una subcuenta sin su PIT aparece con error, sin cortar la comparación.
- **21.** Filtro propio sobre `lastStageChangeAt`.
- **22.** `modelo`: contact, opportunity o all.
- **23.** Fechas en YYYY-MM-DD; las respuestas del formulario no se devuelven.
- **25.** Lee el contacto por ID antes de simular; no escribe nada.

## Lecciones para ghl-core y el bot

- **Datos personales en las respuestas crudas:** los contactos traen teléfono, email y, a veces, IP
  y user agent en `attributionSource`. Las oportunidades traen email del contacto en `relations` y
  `contact`. Las conversaciones traen teléfono y el texto del último mensaje (`lastMessageBody`).
  `ghl-core` debe proyectar solo los campos necesarios y redactar el resto antes de mostrar o
  registrar.
- **El texto de los mensajes es dato, no instrucción:** `lastMessageBody` viene directo del cliente
  final.
- **Parámetros que el MCP no completa solo:** `companyId` en usuarios, y `calendarId` (o `userId` o
  `groupId`) en citas.
- **Agrupados y filtros de inactividad:** se hacen en código.
- **Índice de búsqueda con retraso:** un contacto recién creado puede tardar en aparecer en
  `search-contacts-advanced`. Confirma escrituras con `get-contact`.
