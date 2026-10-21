# Kairos

Project and task coordination for people and external agents. React + TypeScript + Vite render the panel; shadcn/Radix controls, Lucide React, Tailwind and the existing 234 public CSS tokens provide the interface. Supabase Auth, PostgreSQL/RLS and Edge Functions provide cloud operations, OAuth, remote MCP and durable webhook delivery. Hermes and Claude execute outside this product.

Portuguese and English are supported. The panel retains 21 named routes plus 404, eight project tabs and saved views; global Files and agent supervision are approved additions. File actions store metadata. Local invitation, profile, security and billing demonstrations do not provision remote services.

## Run

Node.js 22+ (`.nvmrc`), npm and Docker for database verification:

```sh
npm ci
npm run dev            # http://localhost:5180, strict port
npm run build          # dist/index.html plus assets
npm run preview
npm run typecheck      # frontend TypeScript and browser TS; shared JS is not universally checkJs-checked
npm run check          # lint, types, formatting, Node/database tests, tokens, build
npx playwright install chromium
npm run test:e2e       # isolated no-cloud browser suite, strict 5180
npm run test:agent:ui  # cloud-mode fixtures and opt-in real local Auth/DB, strict 5181
npm run test:oauth:ui  # consent, strict 5180; private real Auth fixture env required
```

The default browser suite explicitly clears cloud variables and never reuses an existing listener. The dedicated cloud suites need the local stack and private fixture environment for their live tests. Missing credentials are reported as skipped, not cloud proof. See [verification](docs/verification.md) for actual commands and boundaries.

At `/`, sign in when cloud is configured or select **Continue on this device** for the local demonstration. Local graphs remain in `gr8r.workspaces.v1`, with the original `gr8r.v2` retained during recovery. Cloud organizations start empty; there is no automatic local-to-cloud import. See [Supabase setup](docs/supabase-setup.md).

## Structure and contracts

- `index.html` → `src/app/main.tsx`: single React SPA, including `/auth/callback`, `/oauth/consent`, `/app/...` and `/app-local/...`. Vite dev/preview and Vercel use this same entry.
- `src/app/`: Auth, shell/navigation, task views/details, projects, schedules, files, remaining routes and integrations. Draft guards own navigation/recovery; UI does not authorize database access.
- `src/components/ui/`: shadcn/Radix primitives; native labels, focus behavior and semantic token classes.
- `src/domain/`: typed operation contracts. `src/workspace/normalized.ts` sends human JWT RPCs with CAS/idempotency; `local-panel-repository.ts` exposes the same panel contract over device persistence.
- `src/styles/tokens.css`, `src/core/design-tokens.js`: public token definitions and tooling inventory. Shared calendar, seed, local mutations and locale modules remain live; the old HTML renderer, global store, delegated actions and cloud snapshot writer are retired.
- `supabase/functions/`, `supabase/migrations/`: shared authorization/operations, API, MCP and webhook worker; additive normalized migrations through `202610200008`.
- `tests/fixtures/legacy-workspace-*`: historical compatibility fixtures only. They are outside the frontend import closure and are not the current React lifecycle proof.

Use React escaping for literal user content and DOMPurify only for explicitly supported rich content. Keep operations scoped to workspace, use authoritative versions, preserve drafts on failures and follow every cursor. Project privacy, byte uploads and actual invitations require separate contracts.

The [design-system guide](docs/design-system.md) describes token policy. `check:tokens` audits authored CSS plus JS/TS/JSX/TSX styles and static `cn`/`cva` utility sources; semantic aliases must resolve to declared foundation variables. Dynamic geometry and validated domain colors remain runtime data. No component directory is exempt.

## Deploy and status

`vercel.json` builds Vite, serves `dist/` and rewrites SPA routes to `/index.html`. Only public Supabase URL/publishable keys belong in frontend build variables. Private provisioning/worker/consumer secrets stay outside Git and frontend bundles.

The dedicated hosted backend has separately recorded API/MCP proof. Final frontend publication, production Auth URLs/CORS, real Hermes acceptance and two actual Claude-user connections remain activation gates. Local cloud-mode browser proof uses real local Auth/DB; it is not hosted frontend proof. See [verification](docs/verification.md), [architecture](docs/superpowers/specs/2026-10-20-agent-platform-design.md) and [Hermes setup](docs/hermes-integration.md).
