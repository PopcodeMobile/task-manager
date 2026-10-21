# Task 5 independent gate

Spec compliance: **Issues found**. Core supervision is implemented, but draft preservation has a lifecycle hole and the binding real MCP-to-polling acceptance remains unproven.

Task quality: **Needs fixes**. Two Important findings; no Critical finding identified in the scoped review.

Reviewed range: `1fe6a1090fc2d723295a1424a1f6f9990e014bc9..1413ccac33442a6aada193a2c3b7fbc492f0a140`.

## Strengths

- `src/workspace/normalized.ts:51`: RPCs capture their abort controller and check it after resolution, so a disposed request cannot populate a reactivated repository. Instance-local query keys include user, workspace, operation and query; pagination follows all cursor pages and detects repeated cursors (`:59`, `:68`).
- `src/app/shell/WorkspacePanel.tsx:93`: initial hydration captures the event boundary before mutable data, while incremental polling advances the watermark only after successful refresh. Explicit workspace snapshot scoping and refresh generations supplement repository cancellation.
- `src/app/tasks/TaskDrawer.tsx:86`: the main editor retains its original CAS version while dirty, creation retains a generated task ID, and ordinary close/history paths register a flush guard. `WorkspacePanel.tsx:165` retains command retry keys until a successful response.
- `src/workspace/normalized.ts:97`: current preferences require matching user ownership and default to empty personal fields, without reading archived legacy preferences. `TaskDrawer.tsx:319` and the execution controls distinguish assignment from reservation; human intervention uses the audited operation and completion is disabled during an active reservation.
- `src/components/ui/sheet.tsx:9` and `src/components/ui/alert-dialog.tsx:8`: actual Radix/shadcn overlay compositions, with portals and accessible titles/descriptions. `TaskDrawer.tsx:270` sanitizes rich previews and the React task/title rendering remains text.
- `src/app/auth/AuthProvider.tsx:4`: callback return destinations are constrained to local application paths; PKCE exchange and recovery remain on the existing Auth instance. Focused unchanged-interface check of `src/app/integrations/client.ts:1` confirms the imported client is `window.gr8rAuth.client`, not a second client or service credential.

## Critical

None identified. This is a scoped code review, not a vulnerability scan or certification of the unchanged backend.

## Important

1. **A token refresh silently discards unsaved work.** `src/app/App.tsx:59` keys the entire `WorkspacePanel` by `session.access_token`. `src/app/auth/AuthProvider.tsx` updates the session on every Auth state event. A refreshed JWT for the same signed-in user therefore changes the React key, unmounts the panel and drawer, and recreates all their local state from the server. A dirty title/description, pending creation ID and retry map disappear without invoking the navigation flush guard or `beforeunload`. This affects normal long-lived editing, including a draft intentionally preserved after a network failure. Use a stable authenticated-session/identity boundary that survives routine token rotation, while still disposing state on logout or identity replacement. Add a focused regression: edit a task, emit a same-session `TOKEN_REFRESHED` with a different access token, and assert the draft and original CAS version survive; retain the existing logout/identity fencing assertions. Evidence is a direct lifecycle trace in the diff; no new runtime test was run.

2. **The required actual MCP-originated update has no end-to-end polling proof.** `tests/browser/agent-panel.spec.ts:306` calls `f.external()`, which edits intercepted RPC fixtures and fabricates an agent event. The real-backend test beginning at `:345` sends its final external update with `command(human, 'update_task', ...)` over RPC, not through MCP. Those tests prove deterministic polling behavior and real human RPC-to-UI convergence, respectively; neither establishes the binding MCP transport/agent identity/event-to-UI path. The report correctly discloses this limitation, so this is an acceptance-evidence gap, not a claim that polling is broken. Add one focused local acceptance case that sends an actual authenticated MCP command and observes the task and agent-authored activity automatically in the already-open React UI, without reload or service-role application writes. Preserve the useful deterministic race tests.

## Minor

- `src/app/tasks/TaskList.tsx:128`: the task list declares `role="table"` and `role="row"`, but its heading spans and data elements do not declare `columnheader`/`cell` roles. Use native table markup or complete the ARIA table structure so assistive technology can associate the visible headings with cells.
- `src/app/shell/WorkspacePanel.tsx:31` and `src/app/tasks/TaskDrawer.tsx:22`: the new 552-line shell and 594-line editor combine network orchestration, draft lifecycle and substantial rendering. The existing boundaries are workable for this task; extracting the lifecycle hooks and drawer sections before Task 6 expansion would reduce the cost of reviewing further race fixes. This is not a blocking size threshold finding.

## Independent visual comparison

Inspected `/tmp/task-manager-before-react.png` against `/tmp/task5-desktop-light-pt.png`, `/tmp/task5-desktop-dark-en.png`, `/tmp/task5-mobile-light-pt.png`, `/tmp/task5-mobile-dark-en.png`, `/tmp/task5-board-light-pt.png`, `/tmp/task5-alert-resume.png`, `/tmp/task5-real-backend-drawer.png` and `/tmp/task5-real-polling.png`.

Visual verdict: **passes the Task 5 identity gate**. Warm neutral surfaces, narrow sidebar, compact type hierarchy, fine dividers and indigo primary actions remain recognizably Gr8r. Dark surfaces and translated controls are coherent; the 390px captures retain usable title/actions and contain navigation horizontally. Nested confirmation is visibly above the drawer. Reduced route inventory and absent original dashboard are Task 6 scope, not visual defects here. Screenshots do not establish keyboard behavior, actual email delivery or MCP origin.

## Evidence and limits

- Inspected existing final logs, without rerunning suites: `/tmp/task5-browser-complete.log` reports 12 passed; `/tmp/task5-domain-final2.log` reports 74 passed, 0 failed, 1 skipped; `/tmp/task5-oauth-final.log` reports 6 passed. The domain skip is the disclosed gated legacy SDK fixture. No warning/error noise was found in those inspected final logs.
- Inspected `/tmp/task5-red.log` (5 initial failures), `/tmp/task5-history-green.log` (2 passed), `/tmp/task5-cursor-green.log` (2 passed), and `/tmp/task5-edit-green.log` (1 passed). These support the reported test progression; they do not cover same-session token refresh or actual MCP-to-browser convergence.
- Typecheck/lint/build/token/format outcomes are reported in `task-5-report.md`; this review did not rerun them. Coverage percentage, maximum cyclomatic complexity, dependency vulnerability status and representative large-workspace performance were not independently established. Do not convert those into blanket verified claims.
- Exact callback redirect registration is accepted deferred activation work. The unchanged running Auth allowlist and fixture recovery are not counted as actual email confirmation/recovery proof, and no backend/config change is requested by this review.
- Task 6 routes, local adapter, final entry cutover, remaining project tabs, files/attachments and account/settings parity are explicitly outside this gate.
- Read the supplied full diff once in sequential bounded chunks. No changed source file was reopened and no git commands were rerun. The tool truncated a small package-lock excerpt in the first chunk; dependency auditing is consequently not asserted. The only unchanged-source check was the named shared-Auth-client risk at `src/app/integrations/client.ts`.
- No suites, focused runtime tests, deployment, cloud mutation, source fixes or index/HEAD changes were performed. Only this review artifact was written. Stopping condition: task gate delivered; controller decides the two Important follow-ups.
