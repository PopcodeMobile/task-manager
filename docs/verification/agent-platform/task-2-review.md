# Task 2 review

## Spec Compliance

- ❌ Issues found: project deletion is unusable, and task deletion bypasses claim/CAS protections on dependent tasks. Both violate the requested transactional CRUD and equal authorization of direct RPCs.
- ⚠️ MCP/OAuth grant activation and persisted webhook delivery remain later-task responsibilities. Task 2 correctly denies OAuth in `supabase/migrations/202610200002_agent_operations.sql:56`; this review does not certify subsequent activation or deployment.
- ⚠️ Full-suite counts, coverage and deployed Edge performance were not independently regenerated. The implementer's report records the suite results; those suites were deliberately not rerun.

## Strengths

- `supabase/functions/_shared/auth.ts:39` verifies the credential through Auth before constructing the actor at line 65; `supabase/functions/_shared/operations.ts:12` forwards the same user JWT to PostgreSQL.
- `supabase/migrations/202610200002_agent_operations.sql:250` authorizes before cache replay, and line 255 serializes commands using the workspace row. Private claims, replay results and audit tables are revoked from authenticated direct access at line 47.
- `tests/agent-sql.test.js:190` tests rollback when the durable event insertion fails. `tests/agent-sql.test.js:36` exercises takeover and stale completion; these are useful behavioral tests.
- `supabase/functions/_shared/errors.ts:32` maps internal errors to stable public errors without exposing SQL or stack details.

## Issues

### Critical

- None identified in this task-scoped review.

### Important / P1 — project deletion fails before checking claims

- **Location:** `supabase/migrations/202610200002_agent_operations.sql:347`.
- **Problem:** `execute_operation` declares a PL/pgSQL record named `t`, then this query also aliases `public.tasks` as `t`. PostgreSQL cannot resolve `t.workspace_id` and raises `42702` (`column reference "t.workspace_id" is ambiguous`). The branch fails even for an empty project with the correct expected version. Through the HTTP error mapper this becomes a 503, so the advertised delete-project operation cannot work.
- **Reproduction:** In a fresh disposable PGlite database loaded with the repository bootstrap and migrations, create a normalized workspace and project `p1`. After deleting its only task, call `execute_operation(workspace_id,'delete_project','{"id":"p1"}',fresh_key,1)` under `SET ROLE authenticated`. Actual result: `42702`, with internal query beginning `exists(select 1 from public.task_claims c join public.tasks t on t.workspace_id=c.workspace_id ...)`.
- **Fix:** Use an unambiguous table alias distinct from PL/pgSQL variable names. Add focused cases for successful empty-project deletion and rejection with an actively claimed descendant, executed through the authenticated RPC.

### Important / P1 — task deletion silently mutates another executor's task

- **Locations:** `supabase/migrations/202610200002_agent_operations.sql:182`, `:187`, `:264`, `:334`, `:390`; existing cascade definition in `supabase/migrations/202610200001_normalized_work.sql:217`.
- **Problem:** The authorization/CAS/claim checks cover only the task being deleted. `operation_delete_task` then deletes it, and the existing `ON DELETE CASCADE` removes incoming `task_dependencies` belonging to other tasks. An agent with a lease for task A can therefore change task B's dependencies while B is reserved by another agent. B's version remains unchanged, and the emitted deletion event identifies A, leaving no event associated with B that describes the removed dependency. The workspace mutex serializes the violation but does not authorize or version it.
- **Focused reproduction:** Create A in project P1 and B in P2; make B depend on A; attach a file to B; claim B as agent 2 (version becomes 4); claim A as agent 1; call `delete_task` for A with agent 1's valid lease and version 2 under `SET ROLE authenticated`.
- **Observed output:** `[{"version":4,"executor_agent_id":"a2","dependencies":0,"claims":1}]` for B. Before deletion B had one dependency, version 4 and agent 2's active claim. The operation succeeds, removes the dependency, and preserves that same version and lease.
- **Fix:** Before any delete/cascade, enumerate the affected surviving tasks and enforce the applicable lease/CAS rules, or reject agent deletion when it would modify another task's relations. For an authorized human action that changes a surviving task, increment its version and emit an event identifying that task and the relationship removal in the same transaction. Apply the check to every path into the deletion helper, including intervention and project deletion, and account for files/attachments and other cascading relations. Add a direct-RPC regression where B is leased by a different executor and remains entirely unchanged on rejection.

### Minor

- No additional polish findings raised; the two functional blockers should be corrected first.

## Checks and scope

- Reviewed the supplied `c659330..eb5ebd5` diff, including the HTTP/shared modules, SQL, tests and compact parsed OpenAPI schemas/path inventory. No production file was modified, no Git state was changed, and no broad reported suite was rerun.
- **Named outside-diff risk:** cross-entity foreign-key cascades could bypass the new claim boundary. Inspected the existing FK definitions in `supabase/migrations/202610200001_normalized_work.sql`, specifically task dependencies at lines 213–217 and files/attachments at lines 147–154 and 225–230. This confirmed that deleting a dependency target can mutate surviving tasks.
- **Focused execution:** one disposable in-memory PGlite reproduction using the actual bootstrap and migration files. Domain mutations ran under the authenticated role; privileged setup only established memberships and registered agents. The first scenario reproduced the dependency/lease bypass; the following project deletion reproduced SQLSTATE 42702. The process exited unsuccessfully on that expected-to-be-valid deletion, which is the evidence for the first finding, not a successful test-suite claim.
- `tests/agent-sql.test.js:256` covers direct file/label deletion guards but does not cover incoming dependency cascades or project deletion. The focused reproduction resolves those concrete gaps without repeating the existing suites.

## Assessment

**Spec compliance:** Needs fixes.

**Task quality:** Needs fixes.

The shared authorization boundary and atomic outbox design are sound foundations, but deletion paths currently violate both functional CRUD behavior and the promised protection of leased tasks. Stop condition for this review is satisfied: two reproduced blockers and corrective expectations are recorded for the original implementer; approval remains withheld pending a scoped correction review.

# Scoped re-review — round 1

**Fix reviewed:** `eb5ebd53e74218ad5dd5f64833a539a6140deff4..42a4f5a2602bc894c2b3b1def07418715cf4eab8`.

**Spec compliance for the correction:** Approved.

**Code quality for the correction:** Approved.

## Original findings

- **P1 project deletion SQL ambiguity: ADDRESSED.** `supabase/migrations/202610200002_agent_operations.sql:366` uses `claimed_task`, removing the conflict with PL/pgSQL record `t`. The active-descendant claim check and project CAS remain in place. `tests/agent-sql.test.js:295` now exercises authenticated empty-project deletion, deletion of a wholly internal dependency/attachment graph, and rejection of a project with a live claim. The added PostgreSQL regression starts at `supabase/tests/agent-operations.sql:30` and covers successful deletion plus the exact claimed-project rejection.
- **P1 deletion changes another executor's task: ADDRESSED.** `supabase/migrations/202610200002_agent_operations.sql:184` introduces one private batch boundary. Line 187 rejects incoming dependencies from surviving tasks; the following checks reject attachments to files being removed and project-scoped rows referring to surviving tasks. The single-task wrapper delegates to it at line 205, preserving coverage of both direct task deletion and human deletion intervention. Project deletion passes its complete task set and project ID at line 369, so internal relations can disappear together while external relations prevent deletion. The new helper is explicitly revoked at line 201. Human file/label deletion now also rejects linked attachments/labels at line 235; the pre-existing agent restriction remains.

## Approved policy and invariants

- The correction implements the controller-approved rejection policy: surviving task relations must be removed explicitly through existing commands before deletion succeeds. A rejected deletion changes neither the surviving task nor its version, lease, audit or replay state; no synthetic mutation event is required for a rejected operation.
- `tests/agent-sql.test.js:345` compares complete task/relation/file/claim/event/replay snapshots across rejected task deletion, human intervention and project deletion. It also checks that an intervention's attempted lease removal is rolled back on rejection.
- `tests/agent-sql.test.js:376` covers attachment-only blocking, human file/label deletion, stale unlink CAS, and successful deletion after explicit unlink. These cases complement the original lease tests without widening authorization.
- The diff leaves the workspace mutex and authorization-before-replay intact. Every changed deletion path reaches the new check within that same transaction. The complete-set project deletion preserves active-descendant rejection and the existing prohibition on an agent deleting a project containing tasks.

## New Critical / Important findings in the fix diff

- None identified.

## Evidence and review limits

- Read the correction diff and the appended RED/GREEN report. The report records three failing focused regressions before the fix and three passing afterward, plus the updated SQL and disposable PostgreSQL suites. This review evaluated their assertions and implementation; it did not independently rerun those suites or regenerate their evidence.
- No new concrete doubt required a test. No unrelated paths or unchanged code were audited again. Only this requested review artifact was appended; production code and Git state were unchanged.

**Result:** Both original blockers are addressed. The scoped correction is approved; the earlier withholding of approval for those findings is lifted.
