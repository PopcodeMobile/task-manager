# Task 4 scoped re-review, correction round 1

## Verdicts

**Spec compliance:** ✅ Approved for Task 4, within the previously established task boundaries.

**Code quality:** Approved. All three Important findings and the Minor second-workspace coverage gap are addressed. No new blocking defect was identified in the correction diff.

Reviewed fix base `bdb9e2619038bbb27daeda145252a7eded4d766d` through head `b29c4e6c6ea2982d68ad0d5d3f9bdedc96726907`.

## Disposition of original findings

1. **Important: transient DNS failure terminates delivery — ADDRESSED.** `supabase/functions/_shared/webhook-targets.ts:15` introduces a safe resolution-unavailable error; the default resolver at line 34 gathers A/AAAA outcomes, prioritizes proven prohibited addresses and classifies missing/transient answers separately. Validation preserves terminal policy rejection while converting resolver availability failures to the new category. `supabase/functions/_shared/webhook-delivery.ts:159` maps that category into finite retry; `supabase/migrations/202610200004_webhook_delivery.sql:188` validates it and line 193 permits it within the existing eight-attempt limit and backoff floor. Tests at `supabase/functions/tests/webhook-delivery.test.ts:236` cover timeout/empty versus private/mixed answers, including zero sends; the following test exercises the default A/AAAA resolver's partial-failure precedence. `supabase/tests/webhook-dispatch-live.ts:67` verifies actual persisted `pending`/`dns_unavailable`/future-retry state through PostgREST.

2. **Important: lease can expire while awaiting its row lock — ADDRESSED.** `supabase/migrations/202610200004_webhook_delivery.sql:177` locks the matching id/state/token, then line 179 checks the returned lease against a fresh clock before secret access. Completion does the same at lines 189–190 before any delivery/audit/queue mutation. NULL leases also fail closed. `supabase/tests/webhook-recovery.mjs:54` calls the actual production secret/completion RPCs from independent sessions; it proves blocking with `pg_blocking_pids`, observes lease expiry before releasing the unchanged row lock, and requires rejection with state/token/queue preserved. This addresses the reproduced PostgreSQL behavior without weakening replacement-token fencing.

3. **Important: crash recovery bypasses backoff — ADDRESSED.** `supabase/migrations/202610200004_webhook_delivery.sql:154` now handles expired processing state separately, closes the interrupted audit attempt, terminates attempt eight and otherwise persists a fixed recovery deadline at lines 162–163. The due-time check precedes a new reservation. Line 168 persists the crash fallback deadline before I/O using the reserved lease deadline plus the attempt's backoff. Repeated early polls defer queue visibility without incrementing attempts or restarting the wait. `supabase/tests/webhook-recovery.mjs:95` expires only the lease before its initial assertion, verifies all seven retry floors and queue alignment, proves early polling leaves the deadline unchanged, then advances due time explicitly; attempt eight must terminate. The normal HTTP/Retry-After completion path remains intact.

4. **Minor: second-workspace behavioral coverage absent — ADDRESSED.** `supabase/tests/webhook-isolation.sql:1` creates a distinct owner, workspace, connection, executor, subscription and Vault secret. Under `SET ROLE authenticated`, lines 25–33 reject foreign workspace access and foreign identifiers supplied with the caller's own workspace, including listing, configuring, delivery reads, replay, secret RPC access and direct secret-reference reads. Lines 36–37 check B's configuration, replay count and secret are unchanged. `supabase/tests/webhook-postgres.mjs:104` invokes the fixture in the normal integration runner. No production privilege expansion was introduced.

## Correction quality and regression scope

- The fixes maintain the existing private worker boundary, safe persisted summaries, immutable event/body identity and pinned HTTPS transport. The DNS change fails closed without opening a socket while distinguishing recoverable availability from proven policy violations (`supabase/functions/_shared/webhook-targets.ts:34`).
- Recovery tests exercise production RPCs and actual PostgreSQL contention, rather than merely testing a reduced model (`supabase/tests/webhook-recovery.mjs:49`). The normal integration runner includes all three recovery scenarios (`supabase/tests/webhook-postgres.mjs:109`).
- Documentation describes fresh post-lock expiry checks and the fixed crash fallback deadline consistently with the SQL (`docs/hermes-integration.md:9`, `:19`).
- No new blocking issues or additional out-of-scope findings were identified in this fix diff. Untouched production code was not rereviewed.

## Evidence reviewed

- Read the provided correction diff and the appended implementation report. The first combined output was truncated; the missing middle section was retrieved separately. No source files were separately reread.
- Inspected saved focused regression outputs: `/tmp/task4-r1-secret-green.log`, `/tmp/task4-r1-completion-green.log`, and `/tmp/task4-r1-backoff-green.log` each contain the corresponding `PASS production regression` result.
- Inspected `/tmp/task4-r1-final-npm.log`: 66 tests, 65 passed, zero failures, one skipped. The corrected normal integration runner includes the recovery/isolation/live DNS assertions.
- Inspected `/tmp/task4-r1-final-deno.log`: 22 passed, zero failures, two ignored existing shared Auth/OAuth integration cases; the new DNS tests passed. These two cases were not freshly verified in this correction round.
- Inspected `/tmp/task4-r1-runtime-green.log` for second-workspace isolation and existing Cron/receiver integration success, and `/tmp/task4-r1-final-eslint-clean.log` for the clean ordinary ESLint invocation. Other reported Edge/format/typecheck/coverage evidence was supplied by the implementer and not regenerated by this reviewer.
- No suites or new experiments were run: the correction code and focused regression evidence resolved the prior concrete doubts. No source, git, shared database or cloud changes were made. This requested scratch report is the sole write.

## Remaining gates

**Open Task 4 review findings:** none.

Hosted deployment/TLS/egress, real Hermes acceptance, DNS/proxy activation and durable production consumer effects remain Task 7 gates. Pre-existing domain parity remains Task 4a. This approval does not claim those gates are complete or that migration 004 has been applied to the shared or hosted databases.
