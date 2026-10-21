### Spec Compliance

- ❌ Issues found: imported Calendar/Timeline saved views do not reliably apply canonical label filters (`src/app/projects/ProjectDetail.tsx:289`), and project-copy conflict/retry recovery has two broken state transitions (`src/app/projects/ProjectEditor.tsx:100`, `:263`).
- Scope reviewed: Task6b4 only, BASE `edbf2961f7c21a2e2a6aa691748d89a13dd81480`, HEAD `22aee3db18a36c27d9692846ce5b8d3795bab596`; all 23 files in the supplied diff, brief/handoff and project/eight-tab/saved-view inventory. No product/index/HEAD mutation, suite rerun, browser/build, or subagent.
- ⚠️ Cannot verify from this diff: full 21-route cutover, permanent CI/token hardening, hosted activation and broader API/MCP authorization are outside this task. Neither coverage >80% nor universal complexity <10 was measured; the report correctly does not claim them. The four screenshot artifacts were reported but not independently visually inspected in this review.

### Strengths

- `src/app/projects/project-model.ts:131`: bounded atomic project plans use known IDs and approved source-authoritative `duplicate_task_graph`, preserving the existing backend contract instead of reconstructing relation metadata in the UI.
- `src/app/projects/ProjectDetail.tsx:20`, `:303`: all eight built-in tabs are composed, saved views remain additional, and files receive the complete graph while display remains project-scoped.
- `src/workspace/local-panel.js:335` and `src/workspace/local-dto.js:104`: absent-only teams projection/materialization follows the root ruling; tests cover byte-identical reads and rollback on stale CAS (`tests/project-workflows.test.mjs:126`).
- `tests/browser/agent-panel.spec.ts:1405`: real Auth/database coverage checks lost-response idempotency, completedAt and full graph copying. Persisted browser evidence confirms local 40/40 and cloud 20/20, zero skipped/unexpected/flaky.

### Issues

#### Critical (Must Fix)

- None identified within the task-scoped diff.

#### Important (Should Fix)

1. **Canonical label matches disappear from imported saved schedules.** `src/app/projects/ProjectDetail.tsx:289` calls `applyTaskView(snapshot.tasks, saved.filters)` before `ScheduleView` enriches tasks with `graph.taskLabels`. The filter reads `legacyMetadata.labels` (`src/app/tasks/task-view-model.ts:73`), while canonical cloud label assignments live in the relation collection. A matching task with empty/stale legacy metadata is removed before the correct enrichment at `src/app/schedules/ScheduleView.tsx:98`; negated filters can incorrectly include it. Pass saved filter defaults into the schedule view and apply them after enrichment, or enrich with canonical relations before this filter. Add a saved Calendar/Timeline case using an actual canonical label relation, not only priority filters.

2. **A source-task CAS conflict leaves project copy retry stuck on the old versions.** `src/app/projects/ProjectEditor.tsx:100–114` caches commands using only `[draft, base?.version]`. If a source task changes after the sheet opens/plans the copy, the batch correctly rejects its stale expectedVersion. “Check current version” refreshes tasks but does not change that signature or invalidate the cached commands; the project itself can remain at the same version, so the rebase control never appears. Repeated Save sends the same known-stale batch indefinitely until an unrelated project draft field is changed. Retain the draft and provide explicit re-plan/review after a definitive source-task version conflict, while preserving the original batch/key for ambiguous transport failures. Cover source-task-only update and deletion during copy.

3. **Post-commit favorites recovery is incorrectly gated by the source project.** `src/app/projects/ProjectEditor.tsx:74`, `:96`, `:263–265`: after project creation commits but personal favorites fail, the cached result is the recovery authority. A subsequent source-project update sets `conflict`, disabling retry; clicking the offered rebase clears `attempt.current`, discarding the successful result and trying to create the same destination again. Source deletion is worse: retry is disabled, rebase is unavailable, and `dismiss()` refuses to close because `committed` is true (`:87`). Make the committed/personal-save phase independent of source liveness/version, and never clear a committed result through the precommit rebase action. Test source update and source deletion after an injected personal-save failure.

#### Minor (Nice to Have)

- Existing validation noise remains outside this task: `/tmp/task6b4-final-format.log:6` lists 14 unchanged formatting failures. `/tmp/task6b4-final-unit.log:84` and `:86` contain expected compiler-mutation diagnostics, not production typecheck failures. Keep these distinctions explicit in the final gate; no unrelated formatting changes are requested here.

### Checks and Evidence

- Read the supplied diff in consecutive ranges; reread only a truncated test-output segment. Focused outside-diff checks addressed named risks: canonical label filtering (`task-view-model.ts:43–102`, `ScheduleView.tsx:94–100`), command retry identity (`useWorkspaceData.ts:235–272`), task-view personal initialization (`TaskViews.tsx:62–119`) and legacy local access semantics (`actions.js`/project pages matching access/private fields). These checks did not broaden into a merge review.
- Focused read-only Node assertion using the actual `applyTaskView` helper confirmed label prefilter loss: raw canonical task with empty legacy metadata yields 0 matches; the same task enriched from its canonical label relation yields 1. No existing suite was rerun.
- Read `/tmp/task6b4-local-HDsFn8/results.json`: expected 40, skipped 0, unexpected 0, flaky 0, 79.53s. Read `/tmp/task6b4-cloud-P5l6Jg/results.json`: expected 20, skipped 0, unexpected 0, flaky 0, 77.08s.
- Read `/tmp/task6b4-final-unit.log:191–198`: 179 tests, 178 pass, 0 fail, 1 environment-gated skip. Read typecheck/lint/owned-format logs and build evidence: cloud/local build exits 0, private literal matches 0, env unchanged. These are recorded implementer runs, not new independent suite executions.

### Assessment

**Task quality: Needs fixes.**

The main composition and persistence boundaries are well structured and supported by substantial executed evidence. The three edge cases above affect explicit saved-view and concurrent-copy requirements and should be fixed before the Task6b4 gate closes.
