# Progreso

Bitácora para retomar el trabajo entre sesiones. Al empezar, lee la etapa marcada como
**en curso** y su siguiente paso. No rehagas lo que figura como verificado.

Estados posibles: `pendiente`, `en curso`, `esperando a Santi`, `hecha`.

---

## Etapa 1 · Base del proyecto

- **Estado:** hecha (la configuración local se crea con `pnpm subcuenta:alta`, Etapa 4)
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

- **Estado:** hecha
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
- **Prueba del rechazo:** en el segundo intento Santi respondió "No" al permiso de
  `execute_operation` y el contacto no se creó. Del primer intento, hecho mal, quedó el contacto
  `prueba-rechazo@ejemplo.com` en Ronin de Prueba; se borró con `delete-contact` (200) y se
  confirmó por ID y, minutos después, por búsqueda.
- **Siguiente paso:** Etapa 3, núcleo `ghl-core`.

## Etapa 3 · Núcleo `ghl-core`

- **Estado:** hecha
- **Hecho (2026-10-22):**
  - Investigación: SDK oficial 3.1.1 (acepta PIT, tipos pobres), límites de la API y versiones.
    Se eligió cliente propio con `fetch` y `Version: v3` (ver `docs/DECISIONES.md`).
  - `cliente.ts`: `ClienteGhl` por subcuenta con headers de límite, Retry-After, reintento
    exponencial con jitter (429 y 5xx; POST solo 429), concurrencia limitada, tiempo límite,
    errores normalizados (`ErrorGhl`, en español) y logs redactados. `configuracionApi()` lee
    `GHL_API_BASE` y `GHL_API_VERSION`.
  - `subcuentas.ts` y `proveedor-local.ts`: interfaz `ProveedorSubcuentas` con
    `ProveedorSubcuentasLocal` (`config/subcuentas.json` + `.env.local` o entorno) y
    `ProveedorSubcuentasMemoria`. La de Supabase queda para la Etapa 6.
  - `operacion.ts`: tipos `lectura`, `escritura`, `sensible`, `destructiva`; `simular: true` en
    toda escritura; regla de producción con `confirmacionHumana`; validación con zod.
  - `catalogo.ts` con 44 operaciones en `dominios/`: contactos (13), oportunidades (9),
    conversaciones (3), calendarios (5), configuración (4), workflows (3), formularios y
    encuestas (2), usuarios (1) y pagos (4).
  - `redaccion.ts`: `redactarDatosPersonales` y `redactarTodo`; `registro.ts`: `Registrador`
    seguro, salida a stderr.
- **Verificado:**
  - `pnpm verificar` pasa: 55 pruebas unitarias con mocks (límites, reintentos, concurrencia,
    simulación, producción, proyecciones, proveedor local y redacción).
  - `pnpm test:integracion` pasa contra Ronin de Prueba (17 pruebas): todas las lecturas del
    catálogo y el ciclo `PRUEBA-CLAUDE-<fecha>` (simular, crear, actualizar, poner y quitar tag,
    borrar). No queda basura y ningún log contiene el token ni emails.
- **Pendiente:**
  - `enviarMensaje` sin prueba real (ver `docs/DECISIONES.md`).
  - Las pruebas de integración en la nube usan `GHL_PRIVATE_TOKEN` y `GHL_LOCATION_ID`; en la Mac
    de Santi usarán `config/subcuentas.json` y `.env.local` cuando existan.
- **Siguiente paso:** Etapa 4, MCP local `ghl-api` sobre `catalogo` con selector de subcuenta.

## Etapa 4 · MCP propio `ghl-api`

- **Estado:** esperando a Santi (punto [TE ESPERA] de la Etapa 4)
- **Hecho (2026-10-22):**
  - `packages/mcp-ghl-api`: servidor stdio con el SDK MCP v2. 47 herramientas: una por operación
    del catálogo (`snake_case`) más `listar_subcuentas`, `seleccionar_subcuenta` y
    `subcuenta_activa`. Todas aceptan `subcuenta`; las escrituras, `simular` y `confirmar`.
  - Seguridad: esquema estricto, `confirmar: true` obligatorio en producción, anotaciones MCP y
    `anthropic/requiresUserInteraction` en sensibles y destructivas.
  - Subcuenta activa en `.ghl/activa.json`; carga `config/subcuentas.json` y `.env.local` desde
    `CLAUDE_PROJECT_DIR`.
  - `.mcp.json` registra `ghl-api`; `.claude/settings.json` con `allow` de lecturas y `ask` de
    escrituras.
  - `pnpm subcuenta:alta` para crear la configuración local sin tocar archivos a mano.
- **Verificado:**
  - `pnpm verificar` pasa: 65 pruebas (10 nuevas del servidor con un cliente MCP real en memoria y
    la de permisos contra el catálogo).
  - Prueba por stdio contra Ronin de Prueba, en la nube: listar subcuentas, seleccionar `prueba`,
    buscar contactos con el tag `es_prueba` (1), simular la creación de un contacto (sin llamar a
    GHL) y rechazo claro de una escritura en una subcuenta `produccion` sin `confirmar`.
    `.ghl/activa.json` se actualizó sin token ni `locationId`.
  - `pnpm test:integracion` sigue pasando (17).
- **Pendiente:** las cuatro pruebas del plan en Claude Code, en la Mac de Santi.
- **Siguiente paso:** [TE ESPERA] Santi, en su Mac, dentro de `~/ghl-claude-hub`:
  1. `git pull`.
  2. `node --version` (debe ser 20.12 o superior; si no, instalar Node LTS desde nodejs.org).
  3. `corepack enable`, luego `pnpm install` y `pnpm build`.
  4. `pnpm subcuenta:alta`: alias `prueba`, el Location ID de Ronin de Prueba, "s", y pegar el PIT
     cuando lo pida (no se ve en pantalla).
  5. Reiniciar Claude Code, aprobar `ghl-api` y probar: "lista mis subcuentas", "selecciona
     prueba", "busca contactos con el tag es_prueba", "crea un contacto de prueba en modo
     simulación".

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
