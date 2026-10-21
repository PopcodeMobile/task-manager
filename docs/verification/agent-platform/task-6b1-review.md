# Spec Compliance

- ❌ Issues found: the scoped task-view/action implementation is substantially complete, but due-date filtering changes existing behavior and local-calendar semantics (R1/R2), and initial view-preference failures have no visible recovery (R3).
- Missing: reliable local-day due filtering/contextual creation and visible failed-load recovery. Misunderstood: a mutually exclusive due-group classifier is also used as the filter predicate, although legacy date filters overlap. Extra: no material unsolicited feature or backend/schema change found in this task range.
- Scope reviewed: base `439101ad2b28f7ad1ef63f372e648482cdfdd54f`, head `90084780bb880bacc3cfbca09b85d271b227933a`, commits `4bf2ff1` and `9008478`; all 3,391 lines of `review-439101a..9008478.diff`, including all 14 changed files. Task brief, implementer report including follow-up, relevant inventory rows and global binding constraints were applied. This is the Task 6b1 gate, not branch/cutover approval.
- ⚠️ Cannot verify from this diff: PostgreSQL-wide invariants, API/MCP authorization equivalence and complete preservation of all historical graph relations are unchanged boundaries, not independently re-audited here. Canonical graph/detail controls belong to 6b2; schedules 6b3; project route/saved-view CRUD 6b4; archive listing/remaining routes 6c; cutover/token scanner/CI 6d. Their absence is not charged to this task.

# Strengths

- `src/app/tasks/task-view-model.ts:128`: selection and actual generated-child bounds are enforced before execution, with whole-selection reservation preflight and per-child CAS. Transition to Done composes the sort update and completion with incremented expected version, preserving recurrence semantics. Equal-order rebalance is one bounded atomic command set (`:149`).
- `src/app/tasks/TaskDrawer.tsx:91`, `:213`, `:219`: start, recurrence and estimate participate in the effective draft fingerprint; task actions require explicit saving and focus Save; successful clone navigation clears the finished draft guard. The implementation does not silently flush an older draft after completion.
- `src/app/tasks/TaskContextMenu.tsx:100` and `src/app/tasks/task-view-model.ts:205`: drawer/menu action preparation shares selected-ID, CAS and reservation guards. Menu execution checks abort/unmount before navigating. Only explicit intervention passes the reservation guard.
- `src/app/tasks/TaskViews.tsx:175`, `:240`, `:250`, `:586`: drag and menu state are scoped to the repository instance. The recorded native-drag evidence shows an actual old-scope drop, rather than relying solely on a cancelled gesture.
- `src/app/tasks/task-view-model.ts:177` and `:185`: preference writes merge the current identity/workspace envelope, retaining other keys. The focused existing local adapter check found the same merge-on-write approach rather than a second entity writer (`src/workspace/local-panel.js:97`).
- `tests/browser/local-panel.spec.ts:146`, `:167`, `:226`, `:294`, `:478`, `:528` and `tests/browser/agent-panel.spec.ts:782`, `:927`: tests exercise visible edits, reload, native drag, geometry, dirty actions, CAS conflicts, real claims, clone IDs and keyboard menus. Exact header assertions were updated for grouped tables, not removed. No-document-navigation assertion has no change in the reviewed diff.
- Visual check: opened `/tmp/task-manager-before-react.png`, `/tmp/task6b1-table-desktop-dark-en.png`, `/tmp/task6b1-table-mobile-light-pt.png` and `/tmp/task6b1-context-mobile-light-pt.png`. Neutral surfaces, indigo accent, compact typography, literal task text and PT/EN presentation are consistent with the existing token direction. The mobile menu fits the shown viewport; mobile rows have one task-title DOM. The baseline is a Home screenshot, so this comparison does not establish pixel parity for a legacy Tasks screen.

# Issues

## Critical (Must Fix)

- None found within the scoped diff.

## Important (Should Fix)

### R1 — UTC dates change Today/Overdue before the user's day ends

- `src/app/tasks/task-view-model.ts:48` derives today using `now.toISOString().slice(0, 10)`. `src/app/tasks/TaskViews.tsx:654` uses the same UTC conversion when creating in a due group. At 22:30 on October 20 in America/Maceio, a task due October 20 is classified Overdue; creating through Today sets October 21. This affects normal Brazilian evening use, not only an unusual input.
- The legacy calendar helpers use local year/month/day and local start-of-day (`src/core/utils.js:20`, `:24`, `:25`, `:29`). Preserve that date-only contract when classifying and creating tasks, using calendar-day arithmetic rather than UTC ISO truncation. Add a focused timezone-boundary test covering grouping/filtering and the composer.
- Independent inline model probe returned `maceioAt2230: "overdue"` for due date `2026-10-20` and instant `2026-10-20T22:30:00-03:00`; expected `today`.

### R2 — Next 7 days and Overdue filters no longer match legacy semantics

- `src/app/tasks/task-view-model.ts:59` maps the due filter to the single result of `dueGroup`; `:67` tests membership in that exclusive bucket. Consequently Next 7 days excludes tasks due today, and Overdue includes completed tasks with past due dates.
- Existing `src/shell/view-engine.js:100` defines Next 7 days as days 0 through 7 inclusive and delegates Overdue to `isOver`; `src/core/store.js:299` explicitly excludes Done. Persisted filters retain the same keys while now showing a different task set. The inventory requires complete toolbar/filter parity, so this is a behavioral migration regression.
- Keep filter matching separate from exclusive group placement, preserving today-in-week and open-task-only overdue semantics. Cover `is` and `not` with today, +7 days, +8 days and completed overdue tasks.
- Independent inline model probe returned `weekFilterToday: []` and `overdueDone: ["done"]`; expected `["today"]` and `[]` respectively. Existing tests cover only an open task overdue at midday and do not answer these cases.

### R3 — Preference-load errors are hidden behind an endless loading state

- `src/app/tasks/TaskViews.tsx:71` sets `ready` false; rejection from `repo.personal()` or `loadTaskView()` only calls `setError` at `:82`. The unconditional `if (!ready)` return at `:257` occurs before the error alert and offers no retry. A storage access/JSON parsing failure therefore leaves the whole task list saying Loading view indefinitely even after the operation has failed.
- `src/app/tasks/task-view-model.ts:178` parses stored JSON without local recovery, so malformed preference data is one concrete path into this branch. The component also catches repository preference failures explicitly, but never renders them in this state.
- Render a safe failed-load state with the error and explicit retry before returning the loading state; retain the stored data rather than silently replacing it. Add one focused rejection/recovery UI case. This finding follows directly from the complete initialization/render control flow; no browser suite was rerun to restate it.

## Minor (Nice to Have)

- None additional. The file-size increase alone is not treated as a defect: view model, cells, toolbar, menu and drawer actions have useful boundaries, despite the large composing view component.

# Evidence reviewed

- Read the full supplied diff once in complete consecutive chunks `1–450`, `451–950`, `951–1450`, `1451–1950`, `1951–2400`, `2401–2850`, `2851–3391`; no diff hunk was lost to truncation. The first combined documentation output exceeded the outer output budget; the affected report tail/inventory was reread at its stated path. A final metadata extraction mapped cited additions to destination line numbers; no second source-review pass or git command was used.
- Changed-file exception: `TaskDrawer.tsx:245–285` was read because the diff omitted the middle of the form/status selector. Named doubt: whether the newly exposed recurrence could be bypassed by selecting Done in the form. The unchanged selector excludes Done unless already complete, so this suspicion was dismissed rather than reported.
- Focused outside-diff checks only: `src/actions/drag-drop.js:174–223` to determine whether due-group drag historically changed deadlines (it did not; no finding); `src/shell/view-engine.js:1–181` and the exact `isOver`/date helpers to compare persisted filter semantics and local-day behavior; `src/workspace/repository.ts` plus `src/workspace/local-panel.js:78–107` to assess whether direct preference writes conflict with an adapter cache (no independent entity writer/cache issue found). Initial path guesses for task-operations/filter files did not exist; no broad search or backend crawl followed.
- TDD artifacts inspected: `/tmp/task6b1-dirty-red6.log` shows missing required Save alert after a valid completion attempt, followed by `/tmp/task6b1-dirty-green.log` 1/1 pass; `/tmp/task6b1-context-red.log` shows missing right-click menu; `/tmp/task6b1-context-guard-red.log` shows the absent shared preparation helper. These support the specific red/green claims rather than treating setup failures as behavioral RED.
- Earlier broad `npm test`: `/tmp/task6b1-npm-test-green.log` records 116 total, 115 pass, 1 skip, 0 fail, 24.05s. It predates final isolated changes and is not represented as a full final-source rerun.
- Earlier frozen browser gate: `/tmp/task6b1-browser-gate.json`, `/tmp/task6b1-browser-local.log`, `/tmp/task6b1-browser-cloud.log`, `/tmp/task6b1-browser-oauth.log`: local 11/11; cloud 14 pass/1 fail; OAuth 6/6. The cloud failure is explicitly the old global Tasks-table 5-column assertion. The report accurately discloses it. `/tmp/task6b1-final-targeted-gate.json` and `/tmp/task6b1-final-cloud.log` show the corrected layout/create/edit/comment/board/supervision case passed 1/1.
- Native evidence: `/tmp/task6b1-native-evidence-report.json` records the exact command `npx playwright test --config playwright.local.config.ts -g 'native task drag' --reporter=json --output /tmp/task6b1-native-evidence-results`, 1 expected/0 unexpected/0 skipped/0 flaky, empty annotations, and attachment `dragStarts:1,drops:1,unchangedOtherWorkspaceRevision:0`. This is prior direct evidence; it was not regenerated.
- Follow-up local: `/tmp/task6b1-context-local-final.log` records 6 passes and the ambiguous ellipsis locator failure. `/tmp/task6b1-context-local-green-final.log` then records 3/3 passes (board regression and two menu/scope/mobile cases), 6.8s. The six other passes are prior affected-source evidence, not a claimed repeated full final suite.
- Final actual cloud: `/tmp/task6b1-context-cloud-final.log` records the original 102-task/CAS/claim/dirty-action regression passing in 1.1m and the menu setup timing out. `/tmp/task6b1-context-cloud-menu-final.log` records the corrected separate real menu/claim fixture 1/1 pass including cleanup, 2.5s. These are two distinct executions, not a falsely combined all-green log.
- Final models/compiler/style: command `node --test tests/task-views.test.mjs tests/local-panel-types.test.mjs tests/tokens.test.mjs`; `/tmp/task6b1-context-final-models.log`: 17/17, 0 fail/skip, 5.58s. The compiler rejection diagnostics are expected output of negative type probes. Final typecheck/lint/scoped Prettier/diff logs (`context-final-types.log`, `context-final-lint.log`, `context-final-format.log`, `context-final-diff.log`) contain no failure or warning; token log reports 234 public tokens/106 sources. No full `npm run check` claim is made; existing formatter/TSX scanner scope remains 6d.
- Builds: `node /tmp/task6b1-build.mjs`; `/tmp/task6b1-build-cloud.log` and `/tmp/task6b1-build-local.log` both finish successfully (2.34s/2.28s). `/tmp/task6b1-build-scan.json` records 4/5 JS bundles, 2 private-value candidates, 0 literal matches and unchanged environment file. This supports the bounded literal scan claim, not a comprehensive secret/security audit. No credential values were read into this review output.

# Independent focused probe

- Ran only the following read-only inline command from the worktree; no suite, browser, build or source mutation. It checks the specific unanswered due-date doubts behind R1/R2:

```sh
node --input-type=module <<'JS'
import { applyTaskView, readTaskView, dueGroup } from './src/app/tasks/task-view-model.ts';
const now = new Date('2026-10-20T12:00:00Z');
const task = (id, patch = {}) => ({
  id, title: id, key: id, projectId: 'p', status: 'todo', priority: 'none',
  sortOrder: 0, version: 1, archived: false, legacyMetadata: {},
  createdAt: now.toISOString(), updatedAt: now.toISOString(), ...patch,
});
console.log(JSON.stringify({
  weekFilterToday: applyTaskView([task('today', {dueDate:'2026-10-20'})],
    readTaskView({filters:[{f:'due',op:'is',v:['week']}]}), [], [], now).map(t=>t.id),
  overdueDone: applyTaskView([task('done', {status:'done',dueDate:'2026-10-19'})],
    readTaskView({filters:[{f:'due',op:'is',v:['overdue']}]}), [], [], now).map(t=>t.id),
  maceioAt2230: dueGroup(task('localToday', {dueDate:'2026-10-20'}),
    new Date('2026-10-20T22:30:00-03:00')),
}));
JS
```

- Exit 0; output: `{"weekFilterToday":[],"overdueDone":["done"],"maceioAt2230":"overdue"}`. Imports/formatting above are simplified only by omitting the unused `reorderTask` import from the executed command; behavior and input/output are identical.

# Assessment

- **Task quality: Needs fixes.** R1–R3 affect ordinary filtering/creation or recoverability and should be addressed before approving Task 6b1. The atomic command, draft, reservation and context-menu work is well supported by the reviewed code and frozen evidence.
- **Stop condition reached for review:** report written; source, index, HEAD, branches and root-owned plan/spec remain untouched. Only this review report was created. No subagents, suite reruns, browser starts, deployment, push or merge.
