### Spec Compliance

- ❌ Issues found: the consent activation is bound to `authorization_id` but not to the exact prepared grant selection. Overlapping submissions for the **same** Auth authorization can activate another submission's workspace/capability choices. This breaks the consent binding/failure-isolation requirement; see P1 below (`supabase/migrations/202610200003_integration_grants.sql:44`, `:62`; `src/app/integrations/client.ts:37`, `:45`).
- ✅ The requested implementation files are represented in the diff. MCP uses the official stateless handler and all 12 tool names, reuses the established operations, and rejects ordinary browser JWTs (`supabase/functions/mcp/index.ts:42`, `:46`; `supabase/functions/mcp/tools.ts:53`). React has an independent entry and the existing default entry is preserved (`src/app/main.tsx:1`; `vite.config.js:67`; `vercel.json:5`).
- ⚠️ Real Claude/Hermes interoperability and cloud activation are Task7 gates, not established by this review. The controller separately reported a schema-only hosted Auth compatibility check; that does not establish runtime OAuth behavior. Existing legacy fences and snapshot/normalized ownership were not modified in this diff; broader guarantees belong to the preceding task gates.

### Strengths

- Membership, current connection status, per-workspace capability, current Auth consent and nondeleted OAuth client are checked in PostgreSQL on each delegated operation. Row locks support immediate revocation semantics rather than relying on JWT expiration (`supabase/migrations/202610200003_integration_grants.sql:117`).
- Pending grants remain inactive until Auth approval, write activation creates the server-bound executor, and read grants do not recover a historical executor during reconsent (`supabase/migrations/202610200003_integration_grants.sql:58`, `:67`). Connection tables and internal helper functions are not directly accessible to authenticated callers (`:20`, `:30`, `:140`).
- MCP does not accept actor identity in tool arguments. The unchanged operation transport forwards the user's JWT rather than a service credential (`supabase/functions/mcp/tools.ts:33`; `supabase/functions/_shared/operations.ts:14`).
- Local tests use actual PKCE exchange, a shared client with two Auth users, the official MCP client, and direct RPC denial after revocation. The tests distinguish live local evidence from the deferred vendor/cloud gate (`supabase/functions/tests/oauth.test.ts:90`, `:131`, `:340`; `tests/browser/oauth-consent.spec.ts:85`).

### Issues

#### Critical (Must Fix)

- None identified within this task-scoped review.

#### Important (Should Fix)

**P1 — Bind activation to an immutable consent selection, not only the Auth request ID.**

- Locations: `supabase/migrations/202610200003_integration_grants.sql:44`, `:45`, `:62`, `:67`; `src/app/integrations/client.ts:37`, `:45`.
- `prepare_integration_consent` permits repeated preparation for the same still-pending `authorization_id`, overwriting the connection's grants. `activate_integration_consent` checks only that ID and consumes whichever grants are currently stored. The client does not carry an attempt version, nonce, or selection digest between preparation and activation.
- Valid interleaving: tab A prepares read-only access; tab B (a duplicate page with the same Auth request) prepares write access; A's Auth approval and activation finish before B approves. A reports success for its read-only choice, but the connection is active/write and an executor was created using B's preparation. B may subsequently fail or never finish. This is a consent-flow correctness/security boundary failure, not an unauthenticated or cross-user privilege escalation.
- Focused in-memory PGlite experiment, using the committed migrations and a synthetic Auth schema, executed `prepare(read) → prepare(write)` for `same-attempt`, then approved the Auth row and activated that ID. Observed output: `[{"status":"active","capability":"write","executor_created":true}]`. The interleaving requires no simultaneous database transactions: the race is between the browser's separate RPC/Auth requests.
- Fix: make a prepared selection immutable for its authorization ID, or return and require a server-issued attempt/version bound to that exact selection in activation and cancellation. Stale activation must fail without activating a newer selection, and stale cleanup must not revoke a newer successful attempt. Preserve safe retry semantics for an identical selection.
- Add a regression for two preparations of the same authorization with different workspace/capability choices and both completion orders. The existing different-authorization test does not cover this (`tests/oauth-grants.test.js:103`).

#### Minor (Nice to Have)

**P3 — Reject duplicate workspace grants as validation errors.**

- Location: `supabase/migrations/202610200003_integration_grants.sql:51`.
- A valid pending authorization with the same workspace twice passes the explicit input checks and reaches the primary-key constraint. The focused experiment returned PostgreSQL `23505`, message `duplicate key value violates unique constraint "integration_grants_pkey"`, and detail containing the connection/workspace UUIDs. This is an inconsistent public RPC validation response with unnecessary schema details; the transaction does roll back safely.
- Reject duplicate workspace IDs before insertion (or narrowly translate the expected unique violation to `validation_error`/`PT422`). Verify the direct RPC error shape, since frontend `rpc()` sanitization does not protect callers of PostgREST itself.

**P3 — Remove test-harness warnings from the recorded green output.**

- Locations: `supabase/functions/tests/oauth.test.ts:34`, `playwright.oauth.config.ts:7`; evidence `/tmp/task3-deno-final.log:19`, `/tmp/task3-ui-final.log:1`, `:6`.
- Deno reports the legacy request-signal behavior notice; Playwright/Vite emits conflicting `NO_COLOR`/`FORCE_COLOR` warnings. These do not invalidate the passing functional results, but the review rubric requires clean test output. Configure the native test server/runtime behavior and normalize color environment settings rather than suppressing unrelated diagnostics.

### Checks and Scope

- Read the brief, implementation report and one task diff package. Reviewed source/test/config changes in one segmented pass; lockfile changes were inspected through a package/source summary rather than a line-by-line vulnerability audit. No changed source file was independently reread.
- Named cross-cutting risk: a new delegated grant might bypass established identity/operation checks. Focused unchanged-code inspection covered `_shared/auth.ts`, `_shared/operations.ts`, and the authorization entry, intervention restriction and workspace-list authorization path in migration002. These preserve verified identity and user-JWT transport and invoke the replaced database authorization helper.
- Named new doubt: same-authorization consent preparation may overwrite an in-flight selection. Ran the isolated in-memory PGlite interleaving above, also checking duplicate-grant error behavior. An initial setup used an invalid empty legacy snapshot; after inspecting `clean_workspace_payload`'s required arrays, corrected the fixture to `{projects:[],tasks:[]}`. No production/local-stack data or tracked source was mutated by the experiment.
- Inspected existing final logs rather than rerunning suites: Deno `13 passed / 0 failed`, Edge OAuth `1 passed / 0 failed`, Playwright `4 passed`. Warnings are documented above. No suite was rerun and no subagents, git operations, cloud operations or deployment were performed.
- The only review artifact written is this requested scratch report.

### Assessment

**Task quality: Needs fixes.**

The shared authorization boundary and local protocol evidence are strong, but consent activation must be bound to the specific prepared selection before this task passes its gate. Fix P1 and verify the new overlapping-same-request regression; the remaining findings are minor.

## Scoped Re-review — Round 1

**Spec compliance: previous findings addressed; task gate still needs fixes for one new Important regression introduced by the correction.**

Reviewed only `a0b22db5d0ceb80719c7ead2e69dbe2880f20ac5..1c40d9a8db742accd4f1b2548341addd5cef2c9f` and the appended correction evidence.

### Previous Findings

- **P1 immutable consent binding — ADDRESSED.** Same-authorization selections are canonicalized and compared under the connection lock; conflicting selections receive PT409 and identical pending retries return the same server attempt UUID (`supabase/migrations/202610200003_integration_grants.sql:59`, `:63`). Activation requires the exact current authorization and attempt UUID (`:81`). Cancellation requires that tuple and pending status (`:104`), preventing cleanup from revoking a committed activation or a newer attempt. The client carries the UUID and does not cancel after preparation fails (`src/app/integrations/client.ts:51`, `:56`). New browser tests exercise the actual same-request/read-versus-write interleaving and a genuinely committed activation whose response is replaced by 503 (`tests/browser/oauth-consent.spec.ts:171`, `:241`). The updated uncertainty message and Connections link correctly represent the latter outcome.
- **P3 duplicate-workspace validation — ADDRESSED.** Parsed UUIDs are checked for duplicates before insertion and rejected with PT422 (`supabase/migrations/202610200003_integration_grants.sql:47`). The real OAuth/PostgREST regression asserts status422, code/message, and null details/hint, not merely the frontend's sanitized wrapper (`supabase/functions/tests/oauth.test.ts:120`).
- **P3 test-harness warnings — ADDRESSED.** Playwright removes the conflicting color environment variable (`playwright.oauth.config.ts:3`); the Deno test task selects the runtime's nonlegacy request-signal behavior (`supabase/functions/deno.json:18`). Inspected existing final logs: native Deno13/13, Edge1/1, browser6/6, with the previously reported notices absent. No suite was rerun.

### New Important Finding in the Fix Diff

**P2 — Restore a consistent connection-before-workspace lock order for preparation.**

- Changed locations: `supabase/migrations/202610200003_integration_grants.sql:49`, `:59`. Related established contract: `supabase/migrations/202610200002_agent_operations.sql:269`, `:274`; OAuth connection SHARE locking remains in migration003's `operation_authorize` (`:149`).
- The correction moved membership/workspace validation **ahead of** the connection lock. `prepare_integration_consent` now takes `FOR SHARE OF m,ws` before taking `FOR UPDATE` on the existing connection. An OAuth `execute_operation` first calls `operation_authorize`, retaining a SHARE lock on that connection, and then requests `FOR UPDATE` on the workspace mutex.
- Deterministic conflicting interleaving on an already-active connection C and workspace W:
  1. OAuth writer T1 authorizes, acquiring SHARE(C), and pauses before its workspace mutex.
  2. A fresh reconsent T2 validates its selection, acquiring SHARE(W).
  3. T2 reaches the existing connection and waits for UPDATE(C), blocked by T1.
  4. T1 requests UPDATE(W), blocked by T2. Neither can finish until PostgreSQL selects a deadlock victim.
- This is introduced by the fix: the previous preparation acquired the connection lock before workspace SHARE locks. It affects the expected case of changing consent while a connected agent is writing. PostgreSQL aborts one legitimate consent or domain operation; the current error handling does not make this a successful transparent retry. The passing two-tab test does not exercise consent versus an ongoing domain write.
- Fix: retain early pure validation/canonicalization, but acquire the connection lock before workspace row locks, consistently with the operation path. Then recheck membership/storage/capability and persist/compare the selection under that order. Preserve the immutable-selection and exact-attempt protections already added. Add one controlled PostgreSQL concurrency regression for preparation versus an OAuth write, with bounded waits, proving completion without `40P01`.
- Evidence method: static lock-order analysis, with one focused read of the unchanged `execute_operation` entry/mutex lines to verify the concrete cross-cutting risk. No stack mutation or new runtime experiment was necessary; no concurrency test is claimed to have been run by this reviewer.

### Round 1 Assessment

**Task quality: Needs fixes.** All three original findings are addressed. The newly introduced consent/write deadlock must be corrected before the Task3 gate passes. No new Critical finding was identified in the fix diff; no unrelated review scope was added.

## Scoped Re-review — Round 2

**Spec compliance: Approved for the reviewed Task3 local scope. P2 lock inversion — ADDRESSED.**

- Reviewed only `1c40d9a8db742accd4f1b2548341addd5cef2c9f..64b6aec10e226562fb3c3d91d12f52509839d7a7`, the appended report, and its existing RED/GREEN logs.
- The existing connection's UPDATE lock now precedes membership/workspace SHARE locks (`supabase/migrations/202610200003_integration_grants.sql:57`, `:63`). Shape/UUID/duplicate validation and canonicalization remain early and lock-free. Membership, normalized storage and capability are still checked under row locks before comparing or persisting grants. The identified connection/workspace cycle with an authorized OAuth write is removed.
- The immutable same-authorization comparison remains after the checks (`:70`); no activation/cancellation/privilege or browser changes occur in this correction. Previous P1/P3 findings remain closed.
- The new regression uses independent PostgreSQL sessions, observes the preparation's blocker through `pg_blocking_pids`, then runs the actual operation under the authenticated role and requires both transactions to complete (`supabase/tests/oauth-concurrency.mjs:115`, `:123`, `:125`). It also checks the committed write, pending denial, subsequent read-only access and Auth revocation, so success is not merely absence of a timeout.
- Inspected existing evidence: `/tmp/task3-round2-red.log:15` records actual `40P01: deadlock detected`; `/tmp/task3-round2-concurrency-final.log:4` records 1 pass/0 fail; `/tmp/task3-round2-grants.log:12` records 9 pass/0 fail; `/tmp/task3-round2-pkce.log:4` records the actual Edge OAuth test passing. No suite or focused experiment was rerun by this reviewer.
- **New Critical/Important findings in this fix diff: none.** No broader audit, subagents, production writes or git changes were performed. Only this requested review artifact was appended.

**Task quality: Approved.** The identified P2 is resolved with a minimal lock-order correction and direct PostgreSQL RED/GREEN evidence. This closes the task-scoped local review; vendor interoperability and cloud activation remain the separate previously defined gates.
