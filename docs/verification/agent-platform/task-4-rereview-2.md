# Task 4 scoped re-review, correction round 2

**Spec compliance:** ✅ Approved for this Task 4 correction under the agreed API/MCP threat model.

**Code quality:** Approved. The restricted-role migration finding is **ADDRESSED**. No new blocking issue was identified in the fix diff.

Reviewed base `b29c4e6c6ea2982d68ad0d5d3f9bdedc96726907` through head `9585ebafa87f3ed7b307f65f9015cf7f149cf0ee`, the task brief, and the final round-2 report. Exploratory alternatives are explicitly superseded and are absent from the shipped diff.

## Finding disposition

**Important: migration fails on vendor-owned blanket REVOKE under the real Supabase NOSUPERUSER role, while the earlier superuser fixture masked it — ADDRESSED.**

- `supabase/migrations/202610200004_webhook_delivery.sql:47` replaces blanket Vault/net/Cron function/table/schema revocation with explicit application queue restrictions: pgmq schema and the delivery queue/archive tables. It does not change vendor ownership, precreate `net`, add an HTTP extension, introduce a new transport, or alter authentication. The application table revocation remains in the surrounding context at line 46; worker/setup RPC privileges and round-1 recovery logic have no changed hunks.
- `supabase/tests/webhook-postgres.mjs:21` now accepts an explicit SQL execution role, and its migration loop passes `postgres` for every production migration. The fixture retains delegated extension creation rather than making the application role superuser. `supabase/tests/webhook-acl.sql:3` checks NOSUPERUSER and absence of membership in `supabase_admin`; lines 5–7 require restricted ownership of app objects and retained inaccessible vendor-owned Vault primitives. The runner snapshots all Vault function owner/ACL values before migrations and compares them afterward.
- `supabase/tests/webhook-acl.sql:8` explicitly expects the vendor net privileges and NOLOGIN client roles. Lines 10–27 verify effective private application/Vault/queue/Cron/worker boundaries with both privilege inspection and actual statements under anon/authenticated roles. This avoids the former false assertion that vendor net SQL access was revoked.
- `supabase/tests/webhook-delivery.sql:105` verifies Cron executes as the restricted application owner, and cleanup uses job ID rather than assuming a superuser-owned named job. The runner changes only the disposable scheduler helper ownership to preserve this identity during the real wake-up test.

## API boundary and evidence claims

- `supabase/tests/webhook-postgres.mjs:11` declares the tested exposed schemas and extra search path once and supplies those same values to the auditor and PostgREST launch. The launch explicitly disables database configuration overrides. This proves the fixture's configured boundary; it does not purport to discover hosted settings.
- `supabase/tests/webhook-api-boundary.mjs:5` rejects unknown/unreviewed supplied exposure settings. The inventory at line 12 includes functions regardless of DEFINER/INVOKER and also views/materialized views. Reachability traversal starts at anon/authenticated-callable roots and follows recognized source references to helpers in that inventory. The narrow admin-replay exception preserves its authorization checks and fixed queue/message shape. Negative fixtures in the runner require detection of an invoker reading vendor headers, a definer calling a private-execute helper and an exposed view of headers.
- `supabase/tests/webhook-api-boundary.mjs:53` tests anonymous, human and OAuth-shaped callers through real HTTP. Sensitive schema profile requests, default aliases and actual application worker/setup RPCs are denied. Native GraphQL is exercised independently at line 78: introspection must work, sensitive entries must be absent and explicit sensitive collection queries must fail. This is meaningful API-role/client-claim coverage, not a fresh Auth PKCE flow.
- The bridge scanner is correctly treated in the report as a focused regression aid, not a complete SQL parser or universal future proof. Its inventory is limited to `public`/`graphql_public`, helper traversal recognizes source patterns, and two existing dynamic domain dispatchers are explicitly name-allowlisted. Activation must still review the actual deployed object inventory and helper paths, including any newly introduced schemas or dynamic code. This limitation does not expose a demonstrated current bridge in the scoped correction and is not a new blocking finding.
- `docs/hermes-integration.md:36` documents retained vendor privileges and plaintext worker-header presence in the pending internal request. It does not claim SQL-role denial, exclusive encrypted residence or secret-free internal transport buffers. Subsequent paragraphs require an explicit API allowlist, NOLOGIN roles and review of invoker/definer/view/helper paths. The new activation paragraph requires real deployed REST and GraphQL checks and expressly limits local proof to the fixture configuration.

## Regression assessment

- The four replacement production lines remove the installation incompatibility while keeping application queue restrictions. No application delivery state machine, signature/body identity, endpoint validation, user-operation credential handling or dispatcher code changed in this round (`supabase/migrations/202610200004_webhook_delivery.sql:47`).
- Existing round-1 findings remain closed. The updated restricted fixture retains the production lock-wait, crash-backoff and cross-workspace tests; saved output records their success. No wider rereview of unchanged production code was performed.
- The supported platform boundary matches the prior architecture opinion: no untrusted raw SQL endpoint or SQL login, sensitive vendor schemas excluded from the configured APIs, no unauthorized application bridge, and service-only worker/setup operations. Hosted verification remains an activation gate, not a presumed property of this commit.

## Evidence inspected

- `/tmp/task4-r2-migration-red.log`: the restricted-role run fails with `permission denied for function _crypto_aead_det_noncegen`, reproducing the unsupported vendor-function revocation class.
- `/tmp/task4-r2-graphql-green.log`: recorded PASS results for restricted migration/vendor crypto, bridge negative cases, second-workspace isolation, both production lease-lock cases, crash backoff, all three HTTP principals, enabled native GraphQL, and real Cron/pg_net/private-handler recovery. It reports 38 reachable production functions/views in the scoped audit.
- `/tmp/task4-r2-final-npm.log`: 66 tests, 65 passed, zero failures, one pre-existing skip; the ordinary webhook test runs the final restricted-role integration runner.
- `/tmp/task4-r2-final-lint.log`: clean ordinary ESLint invocation. Remaining reported format/diff checks were not regenerated. Unchanged Deno/TLS/local Edge evidence remains from earlier rounds, as the implementation report states.
- Read the entire provided fix diff in bounded sequential chunks. No suite rerun or new experiment was necessary; no unresolved concrete doubt required one. No source/git/cloud/shared-database mutation occurred. This requested scratch review is the sole write.

## Open findings and remaining gates

**Open Task 4 review findings:** none.

Apply and verify the reviewed migration using the real deployment role, establish the actual hosted REST/GraphQL exposure and deployed RPC/view/helper inventory, and satisfy the existing Task 7 TLS/Hermes/consumer activation gates before enabling scheduled delivery. This approval does not claim those deployment actions or checks have already happened. Task 4a domain parity remains outside this correction review.
