# GHL Claude Hub

Conecta GoHighLevel con Claude: MCP oficial de GHL en Claude Code, núcleo propio `ghl-core`,
MCP local `ghl-api` con selector de subcuenta y bot de Telegram multi-cliente.

- Especificación: [`docs/PLAN.md`](docs/PLAN.md)
- Estado actual: [`docs/PROGRESO.md`](docs/PROGRESO.md)
- Decisiones técnicas: [`docs/DECISIONES.md`](docs/DECISIONES.md)

## Primeros pasos

```bash
pnpm install
pnpm verificar
cp .env.example .env.local                               # llena tus valores en tu máquina
cp config/subcuentas.example.json config/subcuentas.json # pon el locationId de tu subcuenta
```

Nunca hagas commit de `.env.local` ni de `config/subcuentas.json`.
