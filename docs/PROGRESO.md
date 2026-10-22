# Progreso

Bitácora para retomar el trabajo entre sesiones. Al empezar, lee la etapa marcada como
**en curso** y su siguiente paso. No rehagas lo que figura como verificado.

Estados posibles: `pendiente`, `en curso`, `esperando a Santi`, `hecha`.

---

## Etapa 1 · Base del proyecto

- **Estado:** esperando a Santi (punto [TE ESPERA] de la Etapa 1)
- **Hecho:**
  - Monorepo con workspaces de pnpm: `packages/ghl-core`, `packages/mcp-ghl-api`,
    `apps/bot-telegram`.
  - TypeScript estricto (`tsconfig.base.json`, referencias de proyecto). ESLint 10 con
    `typescript-eslint` estricto, Prettier y Vitest.
  - `.gitignore` con `.env*` (salvo `.env.example`), `config/subcuentas.json`, `exports/`,
    `logs/`, `.ghl/`, `node_modules/`, `dist/` y `*.tsbuildinfo`.
  - `.env.example` con todas las variables del plan, cada una con su comentario.
  - `config/subcuentas.example.json` con la forma `alias`, `nombre`, `locationId`, `entorno`,
    `notas`, y su esquema zod en `ghl-core` (`esquemaArchivoSubcuentas`).
  - `CLAUDE.md` con menos de 200 líneas.
  - `.claude/settings.json` con `deny` para leer o editar `.env*` y `config/subcuentas.json`.
    La lista `ask` queda vacía; se llena en las Etapas 2 y 4.
  - `.mcp.json` vacío, listo para la Etapa 2.
  - secretlint en pre-commit (`simple-git-hooks` y `lint-staged`), con reglas propias para el PIT
    de GHL y el token de Telegram.
  - Utilidad `redactarSecretos` en `ghl-core`, con pruebas.
  - Flujo de GitHub Actions `verificar.yml`, que corre `pnpm verificar` en cada push y PR.
- **Verificado:**
  - `pnpm install` y `pnpm verificar` pasan: formato, lint, typecheck, 7 pruebas y escaneo de
    secretos.
  - secretlint detecta PIT de GHL, tokens de Telegram, API keys de Anthropic y tokens de GitHub
    falsos.
- **Pendiente:**
  - Que Santi cree `.env.local` y `config/subcuentas.json` (ver siguiente paso).
- **Siguiente paso:** [TE ESPERA] Santi, en su Mac:
  1. `cp .env.example .env.local` y llenar `GHL_PIT_PRUEBA`.
  2. `cp config/subcuentas.example.json config/subcuentas.json`, dejar solo la subcuenta con
     alias `prueba` y poner su `locationId`.
  3. No pegar ningún valor en el chat.
  4. Después sigue la Etapa 2: agregar `ghl-oficial` a `.mcp.json` y hacer el OAuth.

## Etapa 2 · MCP oficial de GHL en Claude Code

- **Estado:** hecha, salvo confirmar la prueba del rechazo
- **Hecho (2026-10-22, desde la nube con `GHL_PRIVATE_TOKEN` y `GHL_LOCATION_ID`):**
  - El PIT autentica contra la API: `POST /contacts/search` devuelve 200 (1806 contactos).
  - El PIT autentica contra `https://services.leadconnectorhq.com/mcp/anthropic/v2` como
    `Authorization: Bearer`. `tools/list` expone solo 4 herramientas: `search_operations`,
    `describe_operation`, `execute_operation` y `list_locations` (no `search` ni `fetch`).
  - `list_locations` con PIT responde "list_locations dependencies are not configured" (500):
    con PIT no hay listado de subcuentas. Indicio a favor del camino B para el PIT.
  - `search_operations("list pipelines")` devuelve `get-pipelines` (`opportunities.readonly`).
- **Hecho (2026-10-22, segunda prueba tras ampliar scopes):**
  - La subcuenta del PIT es **"Ronin de Prueba"**, con 94 contactos (la cifra de 1806 de la
    primera prueba ya no aplica). Queda confirmada como subcuenta de prueba.
  - REST con `Version: 2021-07-28`: `GET /locations/{id}` 200, `POST /contacts/search` 200
    (5 recientes), `GET /opportunities/pipelines` 200 (2 pipelines), `POST
/opportunities/search` 201, `GET /calendars/` 200 (5), `GET /users/` 200 (2).
  - MCP `anthropic/v2` con PIT: `search_operations("list pipelines")` devuelve `get-pipelines`;
    `describe_operation` y `execute_operation` de `get-pipelines` responden 200 (2 pipelines);
    `execute_operation("search-contacts-advanced")` devuelve 5 contactos.
  - Los argumentos del MCP van en camelCase: `operationId`, `params`, `locationId`, `dryRun`.
  - `list_locations` con PIT sigue respondiendo "dependencies are not configured" (500).
- **Hecho (2026-10-22, OAuth en la Mac de Santi):**
  - `.mcp.json` declara `ghl-oficial`. En `.claude/settings.json`, `execute_operation` está en
    `ask` y `search_operations`, `describe_operation` y `list_locations` en `allow`.
  - Santi completó el OAuth con `/mcp` y quedó conectado.
  - `list_locations` devuelve 2 subcuentas: Ronin de Prueba (94 contactos) y Tomás Figueroa
    RoninX (22 contactos).
  - `search-contacts-advanced` lee 1 contacto reciente en cada subcuenta (200).
  - `search_operations("list pipelines")` y `execute_operation("get-pipelines")` en Ronin de
    Prueba devuelven 2 pipelines (200).
- **Verificado:** `create-contact` con `dryRun: true` en Ronin de Prueba: Claude Code pidió
  aprobación antes de `execute_operation` y no se creó nada. Las 5 pruebas de lectura pasan. **Camino A**: una sola conexión OAuth llega a
  varias subcuentas con `locationId` (registrado en `docs/DECISIONES.md`).
- **Pendiente:**
  - El OAuth solo vive en la Mac de Santi; las sesiones en la nube no lo tienen.
- **Recetas:** `docs/RECETAS-GHL.md` con 10 pedidos de lectura probados en Ronin de Prueba;
  los 10 funcionan (dos con ajuste de parámetros: `search-users` exige `companyId` y las citas
  se piden por calendario).
- **Siguiente paso:** Santi confirma que no existe `prueba-rechazo@ejemplo.com` en Ronin de
  Prueba (la prueba de rechazar el permiso). Luego empieza la Etapa 3.

## Etapa 3 · Núcleo `ghl-core`

- **Estado:** pendiente
- **Hecho:**
- **Verificado:**
- **Pendiente:**
- **Siguiente paso:**

## Etapa 4 · MCP propio `ghl-api`

- **Estado:** pendiente
- **Hecho:**
- **Verificado:**
- **Pendiente:**
- **Siguiente paso:**

## Etapa 5 · Máximo provecho en Claude Code

- **Estado:** pendiente
- **Hecho:**
- **Verificado:**
- **Pendiente:**
- **Siguiente paso:**

## Etapa 6 · Bot de Telegram en local

- **Estado:** pendiente
- **Hecho:**
- **Verificado:**
- **Pendiente:**
- **Siguiente paso:**

## Etapa 7 · Despliegue en Railway

- **Estado:** pendiente
- **Hecho:**
- **Verificado:**
- **Pendiente:**
- **Siguiente paso:**

## Etapa 8 · Notificaciones proactivas

- **Estado:** pendiente
- **Hecho:**
- **Verificado:**
- **Pendiente:**
- **Siguiente paso:**

## Etapa 9 · Extras y empaque

- **Estado:** pendiente
- **Hecho:**
- **Verificado:**
- **Pendiente:**
- **Siguiente paso:**
