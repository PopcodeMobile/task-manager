# Task 4c independent scoped review

Spec verdict: **PASS** for the committed source and isolated proof gate.

Quality verdict: **PASS**. Findings: **0 critical, 0 high, 0 medium, 0 low**. No actionable defect was identified in the owned delta. This does not approve or attest the subsequent shared deployment, live endpoint/MCP verification, UI 6b4 wiring, or final 6d cutover.

## Scope and integrity

Reviewed all 19 changed files in `00ed15afa68698391ba1cf17404dd28e175d0a6d..edbf2961f7c21a2e2a6aa691748d89a13dd81480`, using the exact review handoff, Task 4c brief and implementation report. The supplied review artifact matches `git diff -U10` for that range. All 19 working-tree source hashes match `task-4c-evidence/source-sha256.txt`; all 16 evidence-log hashes listed in the report were independently verified. The dirty root plan/spec are excluded.

No context-manager tool was available; the supplied brief/handoff, repository source and recorded evidence were the review authority. No product files, shared databases, runtime, hosted services or browser state were changed. This report is the only file written by the reviewer.

## Acceptance assessment

- **Strict contract:** shared validation, local rules, OpenAPI and SQL expose the required source ID, explicit destination project and task/project mode. The new command requires source CAS and retains the existing claim helper for agents. The SQL wrapper reuses 006's exact-ID rules for both IDs; shared/local checks preserve punctuation and enforce the UTF-16/blank/NUL/surrogate limits. Server-generated destination identities, strict property allowlists and the existing batch boundary prevent client metadata injection and result references. Local executor credentials remain unsupported by the device contract.
- **Complete graph and new identity:** `202610200007_task_graph_copy.sql:38-60` copies canonical task scalars, complete legacy metadata, current subtask done/order/details, labels, original dependency targets and attachment join metadata/order. Defaults and explicit columns give new task/subtask IDs, version 1, new destination numbering, current creation/update timestamps and no archive/executor/claim. Task mode keeps source status and completion time only when done; project mode resets todo/null. No completion command is invoked, so copying recurrence creates no successor. Comments, global file records, history, views, preferences and calendar events are not copied. The original `duplicate_task` branches remain unchanged.
- **File provenance:** `src/workspace/local-mutations/task-graph.js:35-53` materializes the complete canonical file projection before inserting cloned embedded links. Global-file authority, first-parent derived ownership and explicit null ownership remain intact. SQL copies only joins and never changes the file owner. The existing removal protection continues to prevent deleting an owner while another task consumes its file.
- **Authority, tenant and replay:** the unchanged dispatcher performs current membership/connection/write-grant authorization before receipts and applies its workspace mutex and fingerprint. The new graph helper constrains source selection and destination numbering to that workspace, checks source version, and reuses `operation_assert_claim`. Successful replay retains identities without requiring obsolete CAS or lease state. Local replay checks the current member and original event actor, including cached batch children. Mode participates in the existing fingerprint.
- **Atomicity and routing:** the new task ID is returned both as `id` and `taskId`, so the existing dispatcher/fanout emits one complete graph event for the new task and explicit destination project. There is no nested incomplete `duplicate_task` event. The existing transaction covers graph rows, numbering, rate counters, receipts, audit, delivery and actual pgmq insertion. Batch size remains at most 100. The new helper wrappers are additive, private INVOKER functions with empty search paths and revoked public/anon/authenticated execution; migrations 001–006 and the published engine are unchanged. Fixtures warm 006 validator/graph/batch call paths before applying 007.
- **Scope control:** the frontend change is limited to dependency invalidation; existing prefix mappings already refresh the other copied relations. No new MCP tool, capability, quota or timeout was introduced. UI composition remains 6b4.

## Evidence reviewed and independent probe

Read the saved final npm evidence: **172 tests, 171 passed, 0 failed, 1 skipped**. It includes both actual-source TypeScript mutation guards passing after restoration of line-one `// @ts-check`. The final focused graph suite records **15 passed**. Typecheck, lint and build logs show successful completion; Deno records **25 passed, 0 failed, 3 ignored**, and its entrypoint/test check log completes successfully.

The real PostgreSQL log records `PASS007` for complete graph copying, source provenance, replay, event routing and injected actual pgmq insertion failure rollback. The SQL snapshot includes rate counters, sequences, receipts, graph relations, deliveries and queue rows. Existing webhook tests and the 46-function/view reachability audit also pass in that disposable run, including anonymous/human/synthetic-OAuth private RPC denial. These are isolated test principals, not evidence of two real Claude users or shared-runtime behavior.

I ran one focused in-memory probe through the actual local repository and PGlite fixtures, without registering/rerunning their broad suites. Both backends passed this sequence:

1. Copy a graph, then reuse its key with the other mode: `idempotency_conflict`.
2. Remove the original task's attachment: canonical files and ownership remain unchanged.
3. Delete that original owner while the copied task still links the file: rejected with `validation_error`.
4. Delete the copied consumer: canonical file remains unchanged.
5. Delete the original owner after that: the owned file is removed.

Tool result: `PASS local` and `PASS sql` for all five checks; process exit 0. `git diff --check 00ed15a edbf296` also completed successfully.

## Boundaries and stop condition

The skipped real Supabase Auth/PostgREST round trip and ignored Deno live integrations are still unverified here. Read `webhook-barrier-recon.md`: the historical broad-suite barrier timeout remains unexplained. The newer passing runs do not prove that issue harmless or resolve its cause; it remains a 6d verification limitation.

Coverage percentage, cyclomatic-complexity bounds and p95/performance targets were not measured, and no such certification is made. Root still owns applying reviewed 007, publishing the frozen API/MCP artifacts and collecting actual endpoint/MCP regression evidence. Stop condition met: both independent source gates are clean, evidence bounds are recorded, and no implementation changes are requested by this review.
