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

- **Estado:** en curso
- **Hecho (2026-10-22, desde la nube con `GHL_PRIVATE_TOKEN` y `GHL_LOCATION_ID`):**
  - El PIT autentica contra la API: `POST /contacts/search` devuelve 200 (1806 contactos).
  - El PIT autentica contra `https://services.leadconnectorhq.com/mcp/anthropic/v2` como
    `Authorization: Bearer`. `tools/list` expone solo 4 herramientas: `search_operations`,
    `describe_operation`, `execute_operation` y `list_locations` (no `search` ni `fetch`).
  - `list_locations` con PIT responde "list_locations dependencies are not configured" (500):
    con PIT no hay listado de subcuentas. Indicio a favor del camino B para el PIT.
  - `search_operations("list pipelines")` devuelve `get-pipelines` (`opportunities.readonly`).
- **Verificado:** PIT válido y aceptado por `anthropic/v2`.
- **Pendiente:**
  - El PIT no tiene scopes fuera de contactos: `GET /locations/{id}` y `get-pipelines`
    responden 401 "The token is not authorized for this scope". Santi debe ampliar los scopes.
  - Confirmar que la subcuenta es de prueba: tiene 1806 contactos.
  - OAuth de `ghl-oficial` en la Mac de Santi y prueba de camino A.
- **Siguiente paso:** ampliar scopes del PIT y repetir las 5 pruebas de lectura.

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
