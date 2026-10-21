# Task 4 review

## Spec Compliance

- ❌ Issues found: transient DNS failure incorrectly terminates delivery; lease expiry is not rechecked after obtaining a contended row lock; crash recovery bypasses the specified retry backoff. See Important findings below.
- ⚠️ Hosted Edge TLS/egress, live Hermes acceptance, DNS/proxy activation and durable production consumer effects remain Task 7 gates, as explicitly documented in `docs/hermes-integration.md:95`. They are not Task 4 failures or verified by this review.
- ⚠️ Pre-existing domain-operation parity is outside this review and belongs to the controller's planned Task 4a. This review assesses the new event trigger and delivery machinery, not every unchanged operation's semantics.

## Strengths

- `supabase/migrations/202610200004_webhook_delivery.sql:121`: synchronous event trigger inserts the immutable minimal body, delivery and logged pgmq message in the domain transaction. `supabase/tests/webhook-delivery.sql:43` injects a real queue-insert failure to exercise rollback.
- `supabase/migrations/202610200004_webhook_delivery.sql:60`: recipient authority includes the current connection, workspace grant, bound agent, membership, OAuth client and consent. The subscription's workspace/connection locates its own Vault secret at line 80; safe browser RPCs never take a Vault ID or return signing material (lines 92–118). Worker/provisioning privileges are explicitly service-only at lines 217–219.
- `supabase/migrations/202610200004_webhook_delivery.sql:131`: default executor filtering and unconditional own-agent exclusion apply during fanout. `supabase/functions/_shared/webhook-signing.ts:2` signs exact timestamp/body bytes, while stored payload and event-based request identity stay unchanged across retries.
- `supabase/migrations/202610200004_webhook_delivery.sql:177`: completion locks the delivery and matches the lease token, so a replaced token cannot acknowledge the replacement message; retry/archive and ledger state commit together. Manual replay locks the same delivery, permits only failed state, creates a new queue message and retains attempt/replay audit (line 193). No additional ack/replay identity race was found in these paths.
- `supabase/functions/_shared/webhook-delivery.ts:61`: each attempt uses a fresh pinned client with original TLS hostname, certificate verification, bounded parser/body and abort-driven connection destruction. `supabase/functions/tests/webhook-transport.test.ts:6` exercises actual TLS/parser behavior, including redirects and timeout socket closure. Worker credential rejection precedes store access at `supabase/functions/webhook-dispatch/index.ts:15`.

## Issues

### Critical (Must Fix)

- None identified in this task scope.

### Important (Should Fix)

1. **Transient DNS errors permanently fail the first attempt.** `supabase/functions/_shared/webhook-targets.ts:34` converts resolver failures into `TargetRejected`; the outer catch at line 55 also converts every resolver exception into that policy-rejection type. `supabase/functions/_shared/webhook-delivery.ts:155` then selects `target_rejected` and suppresses retry, and `supabase/migrations/202610200004_webhook_delivery.sql:185` excludes that category from retryable results. An ordinary DNS timeout/SERVFAIL therefore archives a valid delivery as failed on attempt 1. This violates the network-failure retry budget and requires human replay after a transient outage. Preserve a distinct transient resolution/network error and reserve terminal target rejection for invalid URLs or proven prohibited addresses; never send if resolution fails. Add a test that proves a resolver timeout yields a persisted retry while a private/mixed answer remains terminal.

   Focused production-dispatch experiment (no HTTP or database): inject `Deno.errors.TimedOut("DNS timeout")` into the resolver for attempt 1. Observed `{"sent":0,"results":[{"category":"target_rejected","status":null,"retrySeconds":null}]}`. Existing tests assert rejection of resolver exceptions but do not assert the required retry classification (`supabase/functions/tests/webhook-delivery.test.ts:66`).

2. **An expired lease can still decrypt or complete after waiting for a row lock.** `supabase/migrations/202610200004_webhook_delivery.sql:171` and `:181` put `lease_until > clock_timestamp()` only in the `SELECT ... FOR UPDATE` predicate. That predicate can pass before the statement waits for another transaction holding the row; when the holder merely locks without changing it, PostgreSQL can return the row after the deadline with `FOUND=true`. The following guards at lines 172 and 182 check existence/authority but do not recheck expiry. A delayed stale worker can consequently retrieve the signing secret or finalize/archive after its lease expires, contrary to the stated nonexpired-lease fence. After obtaining the row lock, explicitly compare the returned lease expiry to a fresh `clock_timestamp()` before either action. Preserve token/state checks and cover lock contention, not only replacement-token cases.

   Focused experiment in a new disposable official PostgreSQL 17.11 container used the same PL/pgSQL `SELECT ... WHERE lease_until > clock_timestamp() FOR UPDATE` pattern. One session held an unchanged row lock for 3 seconds; the lease expired after 2 seconds. The waiting function returned `{"found_after_lock": true, "valid_after_lock": false}` after a measured 2.75-second wait. No shared database was used; the container was removed. This isolates PostgreSQL lock semantics; the existing full application suite was not rerun.

3. **Crash recovery skips the required retry intervals.** `supabase/migrations/202610200004_webhook_delivery.sql:155` checks the old `next_attempt_at`, line 156 marks the interrupted attempt `lease_expired`, and line 162 immediately reserves its successor with a new 60-second lease. Reservation never advances `next_attempt_at`; only normal completion at line 189 applies backoff. Repeated worker crashes/lost acknowledgements therefore consume all eight reservations at roughly 60-second intervals instead of the specified 30/120/600/1800/7200/21600/86400-second schedule. This is particularly harmful when the receiver accepted the request before acknowledgement loss: duplicate side effects may be retried much faster and the entire retry budget exhausted during a short outage. Persist an appropriate next due time for interrupted attempts, enforce the same backoff floor on recovery, and align pgmq visibility with that time. The test should expire only the lease and prove no new reservation is returned until the computed due time; the current fixture advances both queue visibility and due time (`supabase/tests/webhook-postgres.mjs:106`), so it cannot detect this omission. Static finding; no repeated suite or simulated time campaign was run.

### Minor (Nice to Have)

- **The claimed cross-workspace behavioral test is absent.** `supabase/tests/webhook-delivery.sql:28` labels its following checks “Guest, cross-workspace and delegated OAuth,” but lines 29–34 exercise only a guest in the same workspace and an OAuth principal; the fixture contains one workspace/subscription. Static inspection found the expected workspace-scoped ownership filters and no browser-controlled secret ID, but add a second workspace/subscription and assert that an owner of A cannot configure, list, replay or select signing material for B. This is an evidence/coverage gap, not a demonstrated authorization vulnerability.

## Review boundaries and checks

- Reviewed base `64b6aec10e226562fb3c3d91d12f52509839d7a7` through head `bdb9e2619038bbb27daeda145252a7eded4d766d`, the provided brief and complete implementer report. The first combined tool output was truncated; the missing diff sections were retrieved in bounded sequential chunks. No changed source files were separately reread, and no git operations were run.
- Named cross-cutting risk: a safe webhook RPC might inherit an OAuth-admin bypass or bind a recipient unrelated to its grant. Focused unchanged-code check inspected `integration_human` and the connection/grant constraints in `supabase/migrations/202610200003_integration_grants.sql:3`, `:10`, `:22`, plus agent membership identity in `supabase/migrations/202610200001_normalized_work.sql:93`. The helper rejects delegated OAuth clients; the new RPC filters and recipient joins are consistent with those constraints.
- Named cross-cutting risk: connection revocation and secret access. Inspected `revoke_integration_connection` at `supabase/migrations/202610200003_integration_grants.sql:113`; webhook checks consult the current connection status. Already-issued network bytes remain an explicitly documented limitation (`docs/hermes-integration.md:27`).
- Existing npm/Deno/real-extension/PostgREST/Edge suites were not rerun. Their results remain implementer-provided evidence. Review experiments were limited to the new DNS-classification doubt and the new lock-wait expiry doubt. No source, git, cloud or shared database mutations were performed; this requested scratch report is the only checkout write.

## Assessment

**Task quality:** Needs fixes.

**Reasoning:** The durable transactional boundary, secret isolation and pinned transport are well structured and supported by substantial integration fixtures. The retry classification and two recovery/lease defects undermine promised failure behavior and should be corrected before Task 4 approval; hosted activation remains a separate gate.
