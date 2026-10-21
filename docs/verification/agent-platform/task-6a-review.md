# Task 6a independent review

**Spec compliance: Needs fixes.** The local React boundary, storage-preserving transaction design and scoped delivery are implemented, but initial view migration, returned creation versions and combined completion/recurrence violate the task's preservation/command requirements.

**Code quality: Needs fixes.** Three Important findings below; no Critical finding identified in this diff. This is the Task 6a gate, not approval of the remaining migration or production activation.

Reviewed base `734c48272511a40398d286810a9935105073dea6` to head `e4a7789d3e1737562b0cff6e9271d68ed6a1b35b`, all 21 files in the supplied diff. No source, index, HEAD, shared environment or cloud changes. This review file is the only written artifact.

## Requirement verdicts

| Requirement                                                                                                                      | Verdict and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing React screens through a structural repository; no fake Auth or legacy renderer                                          | Pass. `src/workspace/repository.ts:4`, `src/app/App.tsx:64`, `src/app/shell/WorkspacePanel.tsx:100`; local display identity is separate from Supabase Session. The imported `src/core/task-operations.js:1` is a pure module without imports/listeners/store initialization.                                                                                                                                                                                                |
| Preserve storage keys/version, text IDs, graph, unknown row/envelope metadata and original legacy bytes                          | Pass for reviewed mutations. `src/workspace/local.js:4`, `:96`, `:112`; `src/workspace/local-dto.js:5`; local command bookkeeping is restored out of the graph before persistence. Existing tests and visible reload assertions cover nested unknown metadata and unchanged `gr8r.v2`.                                                                                                                                                                                      |
| Atomic ordered batch, rollback, relations and concurrent CAS                                                                     | Substantially implemented, with the creation-version defect below. `src/workspace/local-panel.js:181` and `src/workspace/local.js:112` perform one synchronous transaction under the legacy lock. Existing unit evidence covers stale child rollback, concurrent edits, quota failure, dependency cycles and protected shared-file deletion.                                                                                                                                |
| Completion/recurrence preserves existing behavior                                                                                | Needs fix I3. `src/workspace/local-panel.js:363` derives recurrence before the submitted field patch at `:372`. Standalone completion is covered, but a combined existing editor operation produces the wrong next date.                                                                                                                                                                                                                                                    |
| Persisted replay, including no-CAS comment after literal old-writer replacement; monotonic conservative legacy revision handling | Pass for the specified regression. `src/workspace/local-panel.js:186`, `:503`; `tests/local-panel-repository.test.mjs:254` uses the exact old record replacement shape and checks one comment plus stale CAS. The final 17-test log confirms that regression passes. New-entity initialization is a separate defect (I2).                                                                                                                                                   |
| No reset on corruption, automatic local-to-cloud import or silent local fallback                                                 | Pass within evidenced cases. `src/workspace/local.js:8`, `:27`; `src/app/App.tsx:21`, `:64`; the explicit local entry selects the adapter. Corrupt JSON and malformed envelopes reject without replacement. Complete origin-wide denial of storage APIs was not proved.                                                                                                                                                                                                     |
| Visible local create/edit/comment/workspace-switch/reload and honest integrations                                                | Pass. `tests/browser/local-panel.spec.ts:21` exercises actual visible writes and rendered persisted comments; `src/app/shell/WorkspacePanel.tsx:360` provides local cloud-required states. Screenshots visibly show the device-storage status and integrations limitation.                                                                                                                                                                                                  |
| Preferences by identity/workspace, pre-auth locale and legacy view preservation                                                  | Needs fix I1. Namespace merging and locale priority are present (`src/workspace/device-preferences.js:12`, `src/workspace/local-panel.js:72`), but first-entry deep links migrate original views into the wrong workspace.                                                                                                                                                                                                                                                  |
| Late responses, draft/CAS recovery, stable sessionBoundary and actual OAuth MCP-to-open-UI regression                            | Pass for reviewed/existing evidence. `src/workspace/local-panel.js:43` captures controllers and `:181` checks before transaction mutation; `src/app/shell/useWorkspaceData.ts:28` retains serial/event-boundary logic. AuthProvider is absent from the diff, and `src/app/App.tsx:101` retains the sessionBoundary panel key. Named cloud evidence includes delayed identity isolation, token rotation, retained drafts and actual OAuth MCP activity reaching the open UI. |
| Document interface/extension seams and stop at scoped conventional commit                                                        | Pass. `src/workspace/repository.ts:4`; handoff/report document 6b/6c consumers and limits. Supplied package lists the requested conventional commit. No absent future route, command, final entry replacement or deferred formatter cleanup is treated as missing 6a scope.                                                                                                                                                                                                 |

## Strengths

- `src/workspace/local.js:112` centralizes atomic persistence and keeps failed validation/storage writes from committing graph, history or request metadata. The tests assert unchanged serialized bytes, not merely rejected promises.
- `src/workspace/local-panel.js:181` and `:503` keep persisted idempotency outside the replaceable record envelope and conservatively fence whole-workspace legacy edits. The exact older-writer replay regression at `tests/local-panel-repository.test.mjs:254` is valuable and correctly distinct from CAS-based deduplication.
- `src/app/shell/useWorkspaceData.ts:16` and `src/app/tasks/TaskExecutionSection.tsx:6` extract existing lifecycle/drawer responsibilities while retaining the reviewed cloud behavior. The shared repository interface is an appropriate extension point.
- `tests/browser/local-panel.spec.ts:21` verifies rendered mutations and reload, graph metadata preservation, independent workspaces and local integrations truth. The tests do not claim remote delivery from fixtures.

## Critical findings

None identified in this scoped diff. This does not constitute a full dependency/security audit.

## Important findings

### I1. First entry through a non-original workspace deep link assigns legacy views to that workspace

**Location:** `src/workspace/local-panel.js:61`; triggering shell path at `src/app/shell/WorkspacePanel.tsx:72` and `:107`.

`personal()` imports `legacy.views` under the adapter's `workspaceId` whenever it is non-null. Only discovery adapters resolve the original first workspace. When the user first visits `/app-local/w/w2/tasks`, discovery skips `personal()` because a workspace ID already exists; the workspace adapter's automatic `savePersonal()` initializes the record instead. Original w1 views are saved as w2 views, and the one-time import prevents w1 from recovering them later. This contradicts the explicitly claimed original-workspace-only migration.

**Focused probe, fresh legacy graph with no `gr8r.preferences.local`:** initialize storage, list its workspaces, call the second adapter's `savePersonal({activeWorkspace: 'w2'})`. Observed:

```json
{ "case": "direct-second-workspace-first-use", "originalWorkspace": "w1", "openedWorkspace": "w2", "storedViews": { "w2": { "p1": { "sort": "due" } } } }
```

**Fix:** resolve the original workspace independently of the requesting adapter whenever importing legacy views, and preserve the current workspace only as selection. Add a first-entry deep-link regression; the present preference test at `tests/local-panel-repository.test.mjs:96` always calls discovery first and misses this path.

### I2. Creation returns an entity version that is immediately stale without another write

**Location:** `src/workspace/local-panel.js:284`, `:508`; fallback at `src/workspace/local-dto.js:3`.

Creation does not initialize the new entity in `panel.versions`, so its mutation DTO returns fallback version 1. After the transaction advances `storageRevision`, `panelState()` initializes that same entity to `storageRevision + 1`. A caller using the just-returned version therefore gets a false conflict. This also applies to other newly created collection entities, including projects/comments; the shared repository's command result is not reliable as the next CAS basis.

**Focused probe:** create a task, read it without intervening mutation, then update using the creation result's version. Observed:

```json
{ "case": "created-version", "returned": 1, "read": 2, "immediateEdit": "version_conflict" }
```

**Fix:** initialize new entity versions inside the same transaction before producing their DTOs, including duplicate/recurrence-generated entities where relevant. Retain conservative revision-derived initialization for genuinely external legacy entities. Test create→read version equality and create→update using returned CAS, plus existing old-writer monotonicity/replay regressions. The current UI's post-command refresh can hide the inconsistency but does not repair the repository contract consumed by 6b/6c.

### I3. Completing and rescheduling a recurring task in one edit creates the next task from stale fields

**Location:** `src/workspace/local-panel.js:363` and `:372`.

The recurrence branch reads `task.recur` and `task.due` and clones the task before applying the submitted patch. The current task editor submits status and dueDate together (`src/app/tasks/TaskDrawer.tsx:105`), so this is reachable through the existing edit flow. A weekly task moved from October 20 to November 20 and completed in the same save produces the next task on October 27, while the completed task is stored with November 20. A simultaneous recurrence change is similarly calculated from the old recurrence value.

**Focused probe:** prepare a weekly todo task due `2026-10-20`; call `update_task` with `{status:'done', dueDate:'2026-11-20'}` and current CAS. Observed:

```json
{ "case": "complete-and-reschedule", "originalDue": "2026-10-20", "completedDue": "2026-11-20", "nextDue": "2026-10-27" }
```

**Fix:** detect the transition against the prior status, apply the validated effective field values, then derive recurrence from the updated task while retaining one transaction and retry deduplication. The next due date for this case should be `2026-11-27`. Extend `tests/local-panel-repository.test.mjs:81` beyond standalone `complete_task` to cover combined edits and recurrence removal/change.

## Minor findings

- `src/app/App.tsx:68`: `as unknown as ReturnType<RepositoryFactory>` bypasses the structural interface check for the local adapter. Introduce a checked TypeScript/JSDoc adapter boundary as this interface grows, so mismatched projections/results fail validation instead of being hidden by a double cast.
- `src/workspace/local-panel.js:234`: the new mutation dispatcher combines all command families in one large function. The implementation is understandable today, but extract cohesive task/project/comment/subtask handlers before expanding it for 6b/6c; no measured cyclomatic-complexity claim is supported by the evidence.
- `/tmp/task6a-build-local-last.log`: the build succeeded but warns that the external outDir is not emptied. Use a fresh task-specific directory or safely clear only that exact build directory when producing future artifact scans, so stale bundles cannot enter the inventory. No runtime failure is inferred from this warning.

## Evidence inspected and limits

- `/tmp/task6a-unit-final.log`: 17/17 passed. `/tmp/task6a-domain-last.log`: 92 tests, 91 passed, zero failures, one explicitly skipped SDK test. Neither log measures coverage; >80% coverage is not verified.
- `/tmp/task6a-local-last.log`: 4/4 passed. `/tmp/task6a-cloud-last.log`: 14/14 passed, including same-session token rotation and actual OAuth MCP update reaching the open task/activity. `/tmp/task6a-oauth-last.log`: 6/6 passed. Suites were not rerun.
- `/tmp/task6a-lint-last.log`, `/tmp/task6a-typecheck-last.log`, `/tmp/task6a-format-owned.log`: successful scoped checks. `/tmp/task6a-tokens-final.log`: 234 tokens/99 files checked; broader TS/TSX token audit remains 6d.
- Both named final build logs show success (4.33s cloud, 4.22s local); local build warning is recorded above. No separate artifact for the reported secret-value scan was named, so that scan remains an implementer claim rather than independently inspected scan output. No credentials were visible in the diff reviewed.
- `/tmp/task6a-check-final.log` genuinely stops at formatting: root plan plus 14 backend/Deno files. Root's stated ownership assigns the remaining 14 format-only corrections to 6d. This is an overall-check limitation, not a new 6a backend-formatting requirement.
- RED evidence inspected: missing-adapter failures in `/tmp/task6a-red.log`, initial UI failures in `/tmp/task6a-ui-red.log`, and the concrete duplicate-comment regression in `/tmp/task6a-old-writer-red.log`. The early UI log includes parser errors, so it is not isolated behavioral RED proof; final browser success is separately present.
- Independently opened `/tmp/task-manager-before-react.png`, Task5 desktop dark/EN and both mobile themes/locales, and all four Task6a report screenshots. Neutral/warm shell, indigo accents, typography and drawer remain consistent with the approved Task5 foundation. Local status and integrations limitation are visible in PT/EN and mobile. The desktop drawer screenshot does not display the comment below the fold; rendered comment proof comes from the browser test. Mobile screenshots cover integrations, not every future route or mobile drawer action.
- Three focused in-memory probes were run because existing tests did not cover the named doubts. They imported the real local repository/adapter and canonical seed with isolated Map storage; they did not touch browser data, repository files, servers or remote services. Their exact results are embedded in I1–I3.
- Unchanged-code checks were limited to named risks: `src/core/store.js:100`–`:200` for the legacy personal-preferences migration/namespace contract, and `src/core/task-operations.js:1` for accidental legacy UI/store side effects through the new import. The TaskDrawer submission body was absent from its diff context; a focused field-location lookup confirmed submitted dueDate at `:105` for I3. No other changed source was reread. The diff was reviewed once in bounded chunks; a final mechanical pass only mapped finding anchors to new-file line numbers.
- No context-manager tool was available. Scope/requirements came from the supplied brief, handoffs, route inventory's local/auth/personal sections, Task5 consumed contracts and reviewer rubric. No coverage report, performance benchmark, dependency scan or global complexity measurement was supplied or inferred from passing tests.

**Stop condition met:** independent Task 6a review recorded; return to implementer for I1–I3, then focused verification and a follow-up gate. No fixes, deployment, push, merge or broader migration approval performed.
