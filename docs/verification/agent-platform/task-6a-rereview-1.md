# Task 6a fix round 1 independent rereview

**Spec compliance: Approved for Task 6a.** I1, I2 and I3 are resolved in the scoped fix.

**Code quality: Approved for this gate, with the two previously recorded nonblocking structural follow-through items retained before 6b expansion.** No new Critical or Important finding identified in the fix-only diff.

Range: `e4a7789d3e1737562b0cff6e9271d68ed6a1b35b..b08bd69c56c15b2947ff6dbe6362a8fc2d736ee1`. Reviewed the supplied three-file diff once in bounded chunks and the appended fix-round report. This is a scoped rereview of the original findings and new fix breakage, not a second review of unchanged implementation or approval of Tasks 6b–6d.

## Finding verdicts

### I1: Resolved — original-workspace ownership and overlapping first imports

`src/workspace/local-panel.js:61` now resolves the first persisted workspace irrespective of the requested adapter workspace, so a first entry at w2 cannot assign w1's legacy views to w2. The latest personal record is reread after asynchronous persistence calls and merged immediately before writing. Current prefs, collapsed state, active selection, unknown top-level keys and current per-workspace views override migration defaults. Existing workspace entries, including an empty object, win over legacy defaults through the view-map spread. Existing personal records found at entry still bypass import; non-local identities remain outside this import path.

`tests/local-panel-repository.test.mjs:290` covers first entry through the secondary adapter and subsequent independent views. The added deterministic delayed-import and overlapping-bootstrap tests cover a current selection, changed theme, extra prefs, current workspace views and unknown keys appearing while an import is pending. The second test also covers a bootstrap record with no original legacy views, ensuring those missing defaults are preserved instead of skipping the import entirely.

`tests/browser/local-panel.spec.ts:125` adds the exact fresh secondary-workspace deep link, visible empty workspace/selection, persisted active selection, reload and switch back to the original content, plus storage assertions for original view ownership. `/tmp/task6a-r1-local-last.log` confirms this and the four existing local workflows pass. I1 is closed.

### I2: Resolved — initialized versions match returned DTOs and subsequent CAS

`src/workspace/local-panel.js:249` introduces transaction-local initialization before new entity DTO production. The changed creation branches initialize tasks, projects, comments and subtasks; duplication and recurrence initialize the generated task and its generated subtasks. Initialization is part of the same persisted panel metadata as the command result, preventing the subsequent read from inventing a higher version solely because storageRevision advanced.

The new task/project/comment tests in `tests/local-panel-repository.test.mjs:306` compare returned/read versions and execute the next update/delete with the returned version. Generated-task tests cover duplication and recurrence, generated subtask version 1 and the immediate task CAS edit. `src/workspace/local-panel.js:517` retains revision-derived initialization for genuinely external legacy entities and extends the traversal to nested subtasks; existing entity drift remains conservative.

`/tmp/task6a-r1-adapter-last.log` confirms all new version tests pass together with the exact older-writer record replacement/no-CAS comment replay test, stale CAS recovery and bookkeeping preservation. I2 is closed; the fix does not replace the required external-writer monotonic/replay behavior with universal version-1 fallback.

### I3: Resolved — completion uses the effective submitted task and stays atomic

`src/workspace/local-panel.js:371` captures the completion transition against prior status, preserves rejection of a second standalone completion, then applies the validated patch before deriving recurrence. The successor therefore inherits the effective due date, recurrence and other submitted fields. Clearing recurrence or due date suppresses generation, and newly enabling recurrence participates in the same completion. The original task becomes done, the generated task receives initialized versions, and the existing transaction/idempotency path remains in place.

The added combined-completion scenarios in `tests/local-panel-repository.test.mjs` explicitly cover rescheduling weekly October 20 to November 20 with successor November 27, changing recurrence to Daily, removing recurrence, clearing due date and newly enabling recurrence. They check copied effective fields, one persisted workspace revision and exact replay with one successor. The later-child-conflict batch test asserts unchanged serialized storage after an otherwise successful recurring completion would have generated a task.

`/tmp/task6a-r1-adapter-last.log` and `/tmp/task6a-r1-domain-last.log` confirm these cases and the existing standalone completion/rollback tests pass. I3 is closed.

## Strengths

- The implementation corrects the three causes with localized adapter changes; it does not alter Auth, the cloud adapter, backend authority or the document-navigation assertion.
- The first-import race is covered using a controlled promise barrier, with no timing sleep. It verifies preservation of concurrent user choices as well as import ownership.
- Version tests exercise the returned CAS contract, and recurrence tests assert both successful retry and later-child rollback. These assertions address the original defects rather than testing only helper implementation details.

## New issues

- **Critical:** None identified in the scoped fix.
- **Important:** None identified in the scoped fix.
- **Minor introduced by this fix:** None identified.

## Prior Minor and out-of-scope follow-through

- **Build-directory warning: closed.** `/tmp/task6a-r1-build-cloud-last.log` and `/tmp/task6a-r1-build-local-last.log` show distinct final temporary directories and explicit `--emptyOutDir`, with no prior outDir-not-emptied warning. `/tmp/task6a-r1-build-paths-final.json` and `/tmp/task6a-r1-credential-scan.json` identify the same directories. The scan artifact records fresh mkdtemp policy, two private candidate values, four cloud/five local JS bundles, eight/nine text artifacts and zero literal private-value matches. It includes the three source hashes without credential values. This is inspected scan evidence, not an exhaustive security audit or an independently rerun scan.
- **Checked local structural boundary: retained Minor.** The original double-cast finding at `src/app/App.tsx:68` is unchanged and explicitly scheduled before 6b expansion. This rereview does not mark it fixed.
- **Cohesive mutation handlers: retained Minor.** The original dispatcher-decomposition recommendation remains before 6b expansion; the bounded fix appropriately avoids a broad refactor. This rereview does not mark it fixed.
- **Global formatter/check limitation: unchanged.** The 14 previously assigned backend/Deno files remain 6d format-only follow-through. No current full `npm run check` or full project-suite pass is claimed here. Future routes, commands, final entry replacement, broader token auditing and deployment remain outside this gate.

## Evidence inspected and review limits

| Artifact                                                                                           | Observed result                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/tmp/task6a-r1-adapter-last.log`                                                                  | 32 tests, 32 passed, zero failures/skips.                                                                                                                                       |
| `/tmp/task6a-r1-domain-last.log`                                                                   | 58 tests, 58 passed, zero failures/skips; includes local storage/domain and normalized repository regressions.                                                                  |
| `/tmp/task6a-r1-local-last.log`                                                                    | 5/5 browser tests passed in 6.1s, including first-entry secondary-workspace migration.                                                                                          |
| `/tmp/task6a-r1-cloud-frozen.log`                                                                  | 14/14 passed in 44.0s; includes token/session/draft/retry isolation, delayed identity results, event-boundary ordering and actual OAuth MCP write reaching the already-open UI. |
| `/tmp/task6a-r1-oauth-frozen.log`                                                                  | 6/6 passed in 6.8s; real consent/PKCE/revoke and recovery cases.                                                                                                                |
| `/tmp/task6a-r1-types-last.log`, `/tmp/task6a-r1-lint-last.log`, `/tmp/task6a-r1-format-check.log` | No type/lint diagnostics; all three matched files pass formatting.                                                                                                              |
| `/tmp/task6a-r1-tokens.log`                                                                        | 234 public tokens/99 files checked; no broader TS/TSX audit inferred.                                                                                                           |
| Both final build logs                                                                              | Successful cloud/local builds in 2.46s/2.44s, with fresh-directory policy and no outDir warning.                                                                                |
| Named scan/path JSON artifacts                                                                     | Paths/counts/hashes present, zero recorded private-value matches, no credential values exposed.                                                                                 |

Only the final `cloud-frozen` and `oauth-frozen` logs are used as final cloud/OAuth proof. Earlier 13/14 results remain failures; worktree writes/HMR are documented contamination possibilities, not a proven application explanation. The provided final-run account states all worktree writes/builds had finished before those sequential runs. The diff does not modify the cloud/OAuth tests or weaken their no-document-navigation assertion. A passing console log does not independently prove the entire environmental freeze, so that operational detail remains the controller/implementer run record.

No suites or focused tests were rerun: the added source/tests and the exact named final evidence answer the original doubts. No unchanged-code exploration, changed-source reread, git command, subagent, browser mutation, server operation or cloud operation was performed. UI markup is unchanged in the fix; the previous visual review stands rather than being repeated. Coverage percentage, comprehensive complexity metrics and performance benchmarks are not inferred from these results.

**Stop condition met:** I1–I3 closed and scoped spec/quality gate approved. Only this rereview artifact was written. No fixes, push, merge, cutover or deployment performed.
