# Original design parity in React and shadcn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute the owned tasks below, then independently review the combined result.

**Goal:** Restore the Gr8r original design across the migrated panel, using React and shadcn, as explicitly requested on 2026-10-21.

**Architecture:** Port the original composition and styling, adapting existing React components and shadcn primitives. Keep current normalized repositories, commands, authorization, draft guards, pagination and agent integrations. Original HTML renderers and delegated event handlers are reference material only and never ship in the active runtime.

**Tech Stack:** Existing React 19, TypeScript, shadcn/Radix, Lucide, Vite, authored CSS and existing design tokens. No framework/dependency migration.

**Spec:** User's explicit requirement: “nós temos que ter uma paridade de design em 100%, mas usando shadcn e react. ajuste o visual”. Reference: https://gr8r-taskmanagement.vercel.app/ and upstream https://github.com/gr8rstudio/gr8r-studio pinned at904205c626918ee96054eb35495c394a60c0c601; local original source also available in git08a2a2e.

## Global constraints

- The original design is authoritative: composition, dimensions, typography, spacing, density, colors, icon treatment, navigation grouping, tables, cards, tabs and overlays. No redesign or generic substitute.
- React components and shadcn controls remain active; no original HTML renderer, dangerous HTML layout injection or legacy event dispatcher.
- Preserve all current business/security behavior and data. No database, API, MCP, OAuth, queue, quota, production, SSH or hosted configuration changes.
- Preserve PT/EN, light/dark, saved preferences, mobile, keyboard navigation, accessible labels, dirty drafts, readonly/claim guards, bounded history and literal user content.
- Existing project tokens remain the source of values. New agent/integration surfaces adopt the original visual system without pretending they existed upstream.
- Validate comparable screens at the same viewport/theme/language and equivalent fixture data. Screenshots without comparison are not visual acceptance; passing functional tests is a separate gate.
- No global reset, removed auth checks, weakened tests or data migrations to hide visual differences. Report genuine reference differences or residual gaps explicitly; do not claim100% from a sampled subset.
- Shared worktree; workers touch only owned paths, never revert another worker, never commit/stage or start shared servers without coordination. Root serializes integration and final checks.

## Review focus

1. Long translated titles and private/missing entities retain compact layout without leaking hidden content.
2. Sidebar overflow/collapse, topbar controls and mobile drawers keep every route reachable without changing the original desktop composition.
3. Shared CSS and shadcn primitives do not regress auth/consent, disabled states, focus or overlays.
4. Visual restoration retains real interactions, drafts/CAS, current bounded history and permission guards.
5. Visual tests use actual rendered geometry and pinned reference screenshots, with deterministic data/time where required; baselines must not simply bless the broken current UI.

### Task 1: foundation, shell and shared controls

**Own:** src/app/shell/WorkspacePanel.tsx, src/app/shell/workspace.css, src/app/styles.css, src/app/App.tsx, src/app/workspaces/WorkspacePicker.tsx, src/components/ui/_, index.html (fonts only), new src/app/design/_, auth screen visual CSS where needed, tests/browser/design-foundation.spec.ts and its isolated config.

**Produces:** Original CSS visual vocabulary (.page/.ph/.acts/.stats/.stat/.grid2/.stack/.panel/.panel-h/.panel-b/.row/.mini/.pcard/etc), scoped safely to panel surfaces; original-looking shadcn Button/Input/Dialog/Sheet; grouped sidebar/topbar with route and draft contracts intact. Keep existing .work-* anchors for test/accessibility compatibility. Shared visual React helpers, if needed, must have typed inputs and be communicated before use.

- [x] Record failing rendered checks for original shell/header/nav and control dimensions.
- [x] Restore original CSS composition/typography/control system and shell, retaining live React navigation and guards.
- [x] Validate desktop/mobile light/dark and existing relevant behavior; record screenshots/geometry and exact commands.
- [x] Provide task report and owned diff for independent review.

### Task 2: dashboards and remaining panel routes

**Own:** src/app/panel/_, src/app/activity/_, new tests/browser/design-panel.spec.ts. No shell/primitives/design shared files.

**Consumes:** Original class vocabulary from Task1; current PanelProps/repository contract unchanged.

- [x] Reproduce Home/Overview regression with rendered two-column/section/compact-row assertions before edits.
- [x] Port Home and Overview original header, joined stats, mini task tabs, progress/portfolio tables, status/workload bars, deadlines/milestones/activity panels using current data/actions.
- [x] Port inbox, my tasks, favorites, notifications, search, members/detail, teams/detail, archive and settings to original composition; retain catalogue/new functionality coherently.
- [x] Preserve paged context, settings guards, unknown preference fields and all current business behavior; validate functional paths and rendered comparisons.
- [x] Provide task report and owned diff for independent review.

### Task 3: projects, task views, schedules, files and overlays

**Own:** src/app/projects/_, src/app/tasks/_, src/app/schedules/_, src/app/files/_, new tests/browser/design-work.spec.ts. No shell/primitives/panel/design shared files.

**Consumes:** Original class vocabulary from Task1; existing repository/execute/navigation/draft interfaces unchanged.

- [x] Record failing rendered checks for original project cards/filters, task density and project tabs.
- [x] Port Projects grid/list/table with original card content/footer/avatar/status/progress composition and compact toolbar.
- [x] Port project overview/eight tabs, task list/board/table, calendar/timeline/files and drawer/menus/edit overlays to original visual structure using React and shadcn.
- [x] Keep current commands, guards, paged context, form accessibility, navigation and data visibility intact; compare rendered originals and validate interactions.
- [x] Provide task report and owned diff for independent review.

### Task 4: independent visual and functional acceptance

**Own:** Root documentation/verification packaging, coordinated existing browser tests only for intentional presentational selector changes; independent reviewers own their reports.

- [x] Freeze writes; create review packages per owned task against f80ccde, independently review spec and quality, and fix material findings in owned modules.
- [x] Run the appropriate existing domain and browser suites plus original-reference comparison across every matched route/view and light/dark/mobile states. Record case-level coverage and residual differences.
- [x] Run final npm run check with actual local SDK fixtures and the Impeccable detector on changed UI. Inspect representative actual screenshots plus all differences; no unsupported100% assertion.
- [x] Update the user preview with the final frozen artifact, archive evidence and preserve pending production activation gates.
- [x] Commit conventional changes. Full-platform main integration stays dependent on the separately approved Task7 activation gates; no publication is part of this visual correction.

## Stop condition

The visual correction is complete only after all matched original surfaces have been ported, independent visual review has no material parity gaps, real functional gates pass, and the user preview serves the verified build. If any surface is unverified, report that exact boundary rather than declaring100%.
