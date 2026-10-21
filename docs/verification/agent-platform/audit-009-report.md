# Activation auditor compatibility with reviewed 009

Date: 2026-10-21. Starting commit: `432e43efc69cb9cc4eb026ad8f93467562ae2414`.

## Scope and cause

Only `supabase/tests/webhook-api-boundary.mjs`, the focused Node test `tests/webhook-boundary-audit.test.mjs`, and this report changed. A matching session report is stored in the ignored `.superpowers/sdd/2026-10-20-agent-platform/audit-009-report.md`.

Migration `202610200009_task_context_execution.sql` renames the reviewed 005 lease projection to `operation_task_before_execution` and delegates from a new `operation_task`. It also renames the existing dynamic read dispatcher to `read_operation_before_context`. The auditor previously required the lease projection inline in `operation_task` and allowed dynamic SQL under only the original read name. Migration SHA-256 was independently read as `f2212f8031061ad9d12cd76e491cf9f53ba2fb064131131c9f7fc3a644f47fb3`; the migration was not modified.

## Change

The existing lease allowlist, no-claim-disclosure checks, and exact workspace/task scope checks now apply to the renamed projection as well as the pre-009 inline form. The new wrapper must delegate the unchanged `p_row` to one unambiguous public function predecessor and retain the reviewed return expression that preserves the reservation while adding execution context. Both projection functions remain private invokers.

The read wrapper must preserve workspace, operation, and query arguments when delegating to one unambiguous public function predecessor. Both read functions retain their reviewed `SECURITY DEFINER` authorization boundary; the predecessor must remain inaccessible to anon/authenticated RPC callers. The exact renamed read predecessor is added to the existing dynamic SQL name allowlist, with scoped delegation and private ACL checks. `operation_validate_before_execution` joins the existing private-invoker helper checks.

Sensitive schema checks, extra search path validation, queue replay handling, and recursive traversal are unchanged. All predecessor bodies still undergo sensitive bridge checks and recursive traversal.

## RED and GREEN evidence

- Before the auditor edit, `node --test tests/webhook-boundary-audit.test.mjs` ran 33 tests: 13 passed, 20 failed. The actual reviewed 009 wrapper fixture failed with `unreviewed dynamic SQL: read_operation_before_context`; the pre-009 fixture passed. Several negatives were consequently blocked at the old dynamic SQL guard before reaching their intended assertion.
- After compatibility handling, all initial 33 tests passed.
- A separate added regression test that removed the reservation from the wrapper return failed with `Missing expected exception`. The reviewed return-prefix check then made it pass.
- Final focused command: `node --test tests/webhook-boundary-audit.test.mjs`: **45 passed, 0 failed, 0 skipped**.
- `node_modules/.bin/eslint supabase/tests/webhook-api-boundary.mjs tests/webhook-boundary-audit.test.mjs`: exit 0.
- `node_modules/.bin/prettier --check supabase/tests/webhook-api-boundary.mjs tests/webhook-boundary-audit.test.mjs docs/verification/agent-platform/audit-009-report.md`: exit 0.
- `git diff --check`: exit 0.

Fixtures extract the reviewed projection/read bodies from 005 and the new wrappers from 009, then provide simulated catalog metadata through the auditor's existing SQL callback. Negative controls alter credentials/whole claims, workspace/task scope, lease active projection, helper ACL/DEFINER flags, missing/ambiguous predecessors, delegation arguments, reservation preservation, and sensitive bridge chains through the wrapper and both predecessors. Each of `net`, `vault`, `pgmq`, and `cron` is tested. Unreviewed dynamic SQL reached through a predecessor and added to the task wrapper is rejected. Sensitive exposure and extra search path checks remain covered.

## Limits and stopping condition

This proves source-auditor behavior against simulated catalog rows, not live SQL authorization or full catalog completeness. This worker did not read credentials or live catalogs, run database/Edge/API/MCP/UI traffic, start servers, deploy, run builds, run race loops, or run the full Node suite. No runtime, migration, dependency, CI, or source behavior was changed. Cron was not touched.

Stop after the focused checks and clean scoped commit. Independent exact review and actual local/hosted catalog rechecks remain the root operator's next gate; live activation is not claimed by this report.
