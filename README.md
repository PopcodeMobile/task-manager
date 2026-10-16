# Gr8r Studio

A calm, structured project management workspace: home dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity and settings.

Built with plain JavaScript ES modules and CSS, bundled by [Vite](https://vite.dev).
Supabase provides optional cloud authentication and persistence; DOMPurify sanitizes rich text.
The interface supports Portuguese (default) and English, with isolated workspaces and a shared token system.

![Gr8r Studio home dashboard](docs/preview.png)

## Getting started

Requires Node.js 22 or newer (`.nvmrc` pins 22).

```bash
npm install
npm run dev       # http://localhost:5173 with hot reload
npm run build     # production build in dist/
npm run preview   # serve the production build locally
npm run lint      # ESLint
npm run format    # Prettier
npm run check     # lint, formatting, unit/database tests, tokens, production build
npm run test:e2e  # browser flows; first install: npx playwright install chromium
```

Without environment configuration, data stays in this browser. Each workspace has its own
snapshot; the legacy local data migrates into one workspace. Cloud mode starts with real
accounts and empty workspaces. Follow [Supabase setup](docs/supabase-setup.md) to activate it.

## Project structure

```
index.html              HTML entry; loads src/main.js
public/favicon.svg      brand mark
vite.config.js          Vite config, including the Lucide icon-subset plugin
eslint.config.js        lint rules (ESLint flat config); formatting by Prettier (.prettierrc.json)
.github/workflows/      CI: lint, format, tests, token audit, build, browser flows
docs/preview.png        README screenshot
src/
  main.js               entry: imports styles and modules, then boots the app
  styles/
    index.css           imports every stylesheet in cascade order
    tokens.css          colours, spacing, type, radius, the shared --gutter
    base.css  components.css  shell.css  panels.css  overlays.css  states.css  motion.css  responsive.css
    views/              list, board, table, calendar, timeline, projects & files
    pages/              settings, auth & onboarding
  core/                 utilities, constants, icons, store (state + lookups), theme
  data/seed.js          demo workspace data
  data/workspace.js     workspace defaults and normalization
  workspace/           local/Supabase repositories, auth and save/switch lifecycle
  locales/             Portuguese and English catalogs
  ui/                   shared render helpers, toasts, the select dropdown
  shell/                render loop and router, sidebar/topbar layout, skeletons, view engine
  components/           task list renderer
  pages/                one module per route
  views/                project views: board, table, calendar, timeline, files, overview
  overlays/             task drawer, modals, popovers, context menu, command palette
  features/             teams, subtasks, archive (rendering)
  actions/              user actions, event wiring, keyboard shortcuts, drag and drop
```

### Layers

`core/store.js` exposes state and lookups while delegating persistence to `workspace/`.
The controller owns revisions, failed saves and workspace scope. Renderers consume state;
actions register in `actions/registry.js`, change state and re-render. `main.js` imports the
handlers explicitly, then initializes the workspace. Pure task operations own related-record
cleanup. See [architecture decisions](docs/adr/0001-workspace-storage.md) and
[implemented improvements](docs/architecture-improvements.md).

## Conventions

- **Rendering:** each page or view is a function that returns an HTML string from the store
  (`S`). `render()` rebuilds the shell and keeps focus and scroll positions.
- **Interactions:** elements declare `data-a="actionName"`. `actions/events.js` delegates the
  click to `A.actionName`. Inputs use `data-in`, blur handlers use `data-blur`.
- **Layout:** every page edge uses `var(--gutter)`, so the breadcrumb, page header, toolbar,
  list, table and board start on the same line.
- **Dropdowns:** write a normal `<select class="select">`. `ui/select.js` renders it as the
  design-system menu and keeps the native element as the source of truth.
- **Icons:** call `ic('name')` with any [Lucide](https://lucide.dev) icon name. The
  `virtual:icons` plugin bundles only the icons the source uses.
- **Language:** call `t()` from `core/i18n.js` for interface copy. Add both catalog entries.
  Persist canonical domain IDs and preserve user text; use locale-aware formatting.
- **Safety:** escape user text with `esc()` in HTML strings. Only task descriptions use
  `safeRichText()`. Workspace payloads are untrusted and validated at repository boundaries.
- **Design:** use the [design system guide](docs/design-system.md). The in-app catalog lists
  every public token and renders the same components used by the application.

## Continuous integration

Every push and pull request runs lint, formatting, unit/database tests, the token audit,
a production build and Chromium browser flows
(`.github/workflows/ci.yml`).

## Deploy

`vercel.json` builds with Vite and serves `dist/`.
