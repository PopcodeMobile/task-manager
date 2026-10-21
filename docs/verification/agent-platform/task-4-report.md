# Task 4 implementation report

Status: implemented and locally verified; frozen for controller's independent review.
Base `64b6aec10e226562fb3c3d91d12f52509839d7a7`, branch `feat/agent-platform`.
No subagents, remote mutations, shared database reset/migration, actual Hermes route modification, browser secret delivery or frontend/domain changes. The controller-owned plan was preserved and excluded from staging. This ignored handoff report is outside the commit.

## Acceptance, ownership and stop condition

Owned: migration004, webhook dispatcher and three shared modules, dedicated Deno/SQL/runtime tests, private setup CLI, function config/check task/lock and `docs/hermes-integration.md`. Deliver persistent signed subscriptions/events, at-least-once queue delivery, finite retries/manual replay, server-owned recipient grants, own-agent suppression and pinned public HTTPS. Stop after full owned-file conventional commit plus reproducible local evidence. Controller performs independent review; activation/hosted/Hermes gates remain Task7.

## Implementation and durable boundary

`domain_events` AFTER INSERT synchronously materializes one immutable-body delivery per matching subscription and calls logged `pgmq.send` in the same command transaction. A real queue insert failure rolls back task/version/event/idempotency/ledger/queue together. Payload stores only versioned IDs/type/time/version; no title/comment/body, claim credentials or auth tokens. Event ID, raw body, correlation ID and `X-Request-ID` remain stable across retries/replay.

Subscription binds the existing active integration connection and its authoritative workspace write-grant agent. Current connection/grant/agent/Auth consent/client/membership are checked on fanout, claim, secret retrieval and completion. Default executor filter plus unconditional exclusion of the recipient agent's own events prevent feedback. Revocation/disable cancels queued work when claimed and blocks new fanout/secret retrieval; a request whose secret was already retrieved and whose bytes are in flight cannot be retracted. Completion after observed revocation is cancelled. Filter changes affect future fanout; disabling also stops queued work.

A batch reserves at most5 deliveries and dispatches concurrently. Ledger attempt/total/replay counters and a fresh UUID lease are stored before HTTP. 60-second queue visibility and lease exceed the bounded batch network/DB budget. A completion locks the delivery and requires matching nonexpired lease; old workers cannot decrypt, change state or archive the replacement message. Crash recovery marks interrupted reservations `lease_expired`, retains audit, counts reservations against the finite8-attempt budget, and uses a new lease. An eighth interrupted reservation becomes terminal on recovery. Queue IDs are never treated as receipt tokens.

Per-cycle8 attempts,7 waits30/120/600/1800/7200/21600/86400seconds. Retryable408/429/5xx/network/timeout/configuration respect a valid Retry-After extension capped86400; SQL independently enforces floor/cap/budget. Other4xx, redirects and rejected targets fail terminally. Failed active deliveries can be replayed by a human owner/admin, preserving event/body/history/total attempts and recording actor+replay cycle. Success/archive or retry/set_vt is atomic with completion. Data/history/archive have no automatic purge; no volatile delivery dedup/state.

Worker uses only a separate private `X-Webhook-Worker-Key`/`WEBHOOK_WORKER_SECRET`, constant-time digest comparison and `verify_jwt=false`. Public keys, user JWTs and wrong/missing secrets cannot touch the store. Worker SQL paths are service_role-only; table/queue/Vault schemas and helper execution are denied to public/anon/authenticated. Initial provisioning/rotation and scheduler setup are trusted service-only CLI flows with explicit current owner/admin validation; browser RPCs cannot accept/return a secret or select another workspace's Vault ID.

Cron is a named30-second job. Its text contains Vault UUID lookups, no plaintext worker secret. pg_net is only a wake-up; real ledger and pgmq own recovery. Responses store category+HTTP status only; no response body, Location, arbitrary headers, stack, SQL error or credential is exposed. The Edge handler fails safely with a generic503 if the database is unavailable.

## Transport and researched limitations

Pinned `npm:undici@7.30.1` Client/buildConnector uses the standard llhttp parser. One fresh client per attempt, only the validated literal IP in custom lookup, original TLS hostname/Host, rejectUnauthorized=true, family fixed/auto-selection disabled, no retry/redirect interceptors. One10-second deadline covers secret fetch, DNS, TLS, headers and bounded body. Abort destroys the client/socket; late DNS cannot initiate a socket after abort. All A/AAAA answers must pass a conservative global-unicast policy before choosing one. Public DNS hostname/default443 only; no IP literal, credentials, query or fragment. Mixed/private/metadata/documentation/tunnel ranges fail closed. 16KiB header/64KiB response body limits; no arbitrary receiver text stored.

Research before corrections: tagged Undici docs/types show maxRedirections is not a current request option; bare Client performs no redirect interception. Removed that unsupported probe-era option instead of bypassing type checking. The standard parser explicitly rejects unsolicited100 Continue even followed by200; this is classified as a network/protocol failure and finite retry, not accepted delivery.103 then final200 is supported. Native TLS fixture independently proved certificate-name-specific rejection using a trusted local CA. Exact Edge positive transport is proved; a certificate-mismatch-specific Edge diagnostic remains opaque/unproved, as the earlier research warned. Do not claim that native TLS evidence alone is hosted verification.

Official sources: [Undici Client](https://github.com/nodejs/undici/blob/v7.30.1/docs/docs/api/Client.md), [versioned parser100 branch](https://github.com/nodejs/undici/blob/v7.30.1/lib/dispatcher/client-h1.js), [Edge tagged worker](https://github.com/supabase/edge-runtime/blob/v1.77.4/examples/main/index.ts), [PostgREST RPC](https://docs.postgrest.org/en/v14/references/api/functions.html), [Vault source](https://github.com/supabase/vault), [pgsodium server key management](https://github.com/michelp/pgsodium#server-key-management), [Docker postgres entrypoint](https://github.com/docker-library/postgres/blob/master/docker-entrypoint.sh). The initial task research/handoff remains the broader primary-source record.

## RED evidence

Before production source existed:

```
node --test tests/webhook-sql.test.js
1 test /0 pass /1 fail
AssertionError: persistent webhook delivery migration must exist
```

`/tmp/task4-sql-red.log`.

```
deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/tests/webhook-delivery.test.ts
FAIL: webhook signing/targets/delivery/dispatcher modules absent
```

`/tmp/task4-deno-red.log`. The independent HMAC expected vector was calculated using Python's standard hmac/hashlib before implementation. The first unit pass found documentation prefix2001:db8 missing from the address classifier; corrected against the IANA ranges already researched. TLS fixture caught unsupported unsolicited100 behavior; consulted exact parser source before defining its fail-closed result. No bespoke HTTP parser was introduced.

Real-extension harness initially stopped on the image's temporary Unix-socket init server, then on the non-superuser postgres role, then on Vault's unavailable server encryption key. Researched entrypoint/source and exact local read-only settings: wait for final TCP readiness, use supabase_admin **only in the disposable fixture**, preload both `pgsodium` and `supabase_vault` (plus Cron/net/statements). Real cryptographic create/decrypt then passed. No stub extension APIs or fake Vault were substituted. A standalone PostgREST fixture void RPC returned actual204; the test adapter was corrected to avoid parsing its empty body. Production scalar worker RPCs return JSON values.

## Final GREEN and reproducible commands

```
npm test
66 tests /65 pass /0 fail /1 pre-existing unconfigured SDK cloud skip
```

`/tmp/task4-final-npm.log`. The added Node testcase runs actual disposable extension + PostgREST + receiver + Cron integration, not SQL string matching or PGlite extension substitutes.

```
DENO_CERT=/tmp/task4-webhook-tls/cert.pem \
TEST_WEBHOOK_TLS_DIR=/tmp/task4-webhook-tls \
node /tmp/task3-run-deno.mjs --unstable-no-legacy-abort \
  --allow-read=/tmp/task4-webhook-tls supabase/functions/tests/
22 pass /0 fail /0 ignored
```

`/tmp/task4-final-deno.log`. Existing private wrapper supplies fresh local Auth/OAuth credentials from the0600 Task3 status file without outputting them. Existing real Auth/HTTP and OAuth PKCE/refresh/revocation suites passed as part of22. The wrapper does not apply migration004 to the shared review database.

TLS test CA generation, all fixture material outside git:

```
mkdir -p /tmp/task4-webhook-tls
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/task4-webhook-tls/key.pem -out /tmp/task4-webhook-tls/cert.pem \
  -days 2 -subj '/CN=webhook.fixture.invalid' \
  -addext 'subjectAltName=DNS:webhook.fixture.invalid'
DENO_CERT=/tmp/task4-webhook-tls/cert.pem \
TEST_WEBHOOK_TLS_DIR=/tmp/task4-webhook-tls \
deno test --unstable-no-legacy-abort --config supabase/functions/deno.json \
  --allow-env --allow-net --allow-read=/tmp/task4-webhook-tls \
  supabase/functions/tests/webhook-transport.test.ts
2 pass /0 fail
```

`/tmp/task4-transport.log`. Tests fragmented/chunked103+200, unsolicited100 rejection, truncated Content-Length, oversized headers/body, metadata redirect with no second connection, valid certificate then specific wrong-name rejection, deadline actual socket close and late DNS no socket. Default native test task explicitly ignores the optional TLS fixture when its env is absent; the22-test verified run supplied it.

```
TEST_WEBHOOK_COVERAGE_DIR=/tmp/task4-final-coverage \
node supabase/tests/webhook-postgres.mjs
PASS
```

`/tmp/task4-final-runtime.log`: official isolated Postgres17.11 + PostgREST14.18, real pgmq1.5.1, Vault0.3.1, Cron1.6.4, pg_net0.20.4. Actual pgmq `read(queue_name,vt,qty,conditional default)` supports the3-positional-argument call; send2-argument overload; `archive(queue_name,msg_id)`; `set_vt(queue_name,msg_id,vt)`. Real Vault create/update/decrypt and executable Cron/net APIs ran. Runner creates/removes only its own process-named containers/network, publishes PostgREST only on an ephemeral loopback port and deletes only its own fixture Auth schema in its **own disposable container**. No shared DB reset/container changes.

Behavioral SQL + I/O coverage:

- One real task/event/delivery/queue record on same-key replay; minimal event body; queue insert failure rolls all side effects back.
- Private queue/Vault/provisioning/scheduler/base tables; owner safe listing; guest/OAuth administrative denial.
- New reservation before I/O; lease expiry/recovery; stale secret/ack rejected; interrupted and completed attempts retained;2 independent processes reserve1.
- Eight failures terminal/archive, normal/backoff Retry-After persistence, human replay cycle/audit/total counters and success.
- Own-agent feedback excluded, connection revoke prevents fanout/secret read and marks observed in-flight completion cancelled.
- Real databaseDeliveryStore calls through actual PostgREST. Receiver verifies raw HMAC/±300s timestamp;503→200; deliberate completion interruption **after HTTP200**, real live lease retained, expiry/replacement worker resends same event/body with a renewed signature. The receiver records effects with a persistent SQL primary key/ON CONFLICT rather than RAM dedup; three transmissions produce one SQL effect.
- Actual Cron tick→pg_net→dedicated-secret production handler→service RPC: first HTTP503 wake-up loss, later200 recovery; queued private target rejected by strict policy without sending it. Fixture-only HTTP/private routes never weaken production URL validation.

```
node supabase/tests/webhook-edge.mjs
PASS
```

`/tmp/task4-edge-final.log`: production modules copied byte-for-byte into an isolated actual user worker on the exact cached Edge image v1.77.4,256MB/2sCPU. Missing/public/user/wrong credentials401; correct dedicated secret200, exactly1 store access. Actual public example.com HTTPS POST: hostname example.com; validatedIP172.66.147.243; Deno.connect literal destination=actual peer=172.66.147.243; parsedHTTP405. This proves production transport execution/egress/parser/pinning on **local Edge**, not accepted Hermes work. No credentials or workspace events sent to example.com; only a transport fixture. Earlier researcher probe additionally proved one lookup/originalTLSservername and rejected lookup with zero sockets.

```
npm run lint
npm run typecheck
npm run build
deno lint --config supabase/functions/deno.json <owned modules/tests/setup/live fixture>
deno check --config supabase/functions/deno.json \
  supabase/functions/webhook-dispatch/index.ts scripts/setup-webhooks.ts \
  supabase/tests/webhook-dispatch-live.ts
npx prettier --check tests/webhook-sql.test.js supabase/tests/webhook-postgres.mjs \
  supabase/tests/webhook-edge.mjs docs/hermes-integration.md
deno fmt --check --config supabase/functions/deno.json <owned TypeScript>
git diff --check
PASS
```

Logs `/tmp/task4-final-{eslint,typecheck,build,denolint,denocheck,format}.log`. Initial lint issues were fixed using explicit Promise-returning test dependencies and Node imports/globals; one scoped lint annotation preserves the direct exact npm pin for isolated Edge resolution. No broad lint suppression or hidden runtime warning.

Coverage collected from the same22-test suite (`--coverage=/tmp/task4-final-coverage`) and actual native dispatcher/PostgREST/Cron run (`TEST_WEBHOOK_COVERAGE_DIR` adds Deno run coverage), then:

```
deno coverage --include='.*supabase/functions/.*' /tmp/task4-final-coverage
88.2% lines /95.7% functions /83.1% branches (first-party functions)
deno coverage --include='.*supabase/functions/.*webhook.*' /tmp/task4-final-coverage
92.7% lines /90.5% functions /89.4% branches (four webhook production modules)
```

`/tmp/task4-final-coverage-{source,webhooks}.log`. Database behavior is executed separately, not counted as JS/SQL coverage. No p95/load/hosted throughput claim.

## Interfaces for Task5 / Task7

Browser uses the authenticated **human JWT**, never service/worker keys:

- `list_webhook_subscriptions(p_workspace_id uuid)->jsonb[]`: id,connectionId,agentId,targetUrl,eventTypes,filterExecutor,enabled,active,createdAt. No secret or Vault UUID.
- `configure_webhook_subscription(p_workspace_id,p_subscription_id,p_enabled,p_event_types text[],p_filter_executor boolean default true)->void`: only safe options. No browser URL/secret change/create. Human owner/admin, no OAuth self escalation.
- `list_webhook_deliveries(p_workspace_id,p_subscription_id,p_before timestamptz default null,p_limit integer default50)->jsonb[]`: newest first,max100; safe state/attempt/total/replay/due/category/status/time fields, no raw body or secret. p_before is creation timestamp for older rows.
- `retry_webhook_delivery(p_workspace_id,p_delivery_id)->void`: failed, active recipient only. Human actor recorded.409 for wrong state/inactive recipient. Void successful PostgREST response may be204.

Worker service-role-only:

- `claim_webhook_batch(p_limit integer default5)->Delivery[] {id,leaseToken,eventId,attempt,rawBody,targetUrl}`.
- `webhook_delivery_secret(p_delivery_id,p_lease_token)->text|null`: current active lease/recipient only.
- `complete_webhook_delivery(p_delivery_id,p_lease_token,p_category,p_status default null,p_retry_seconds default null)->boolean`: false for stale/expired lease; safe category/status persisted and pgmq ack/defer atomic.
- `provision_webhook_subscription(p_workspace_id,p_connection_id,p_admin_user_id,p_target_url,p_secret)->uuid`: trusted setup, administrative principal/current server grant validation; creates/rotates own Vault secret, no arbitrary Vault ID.
- `configure_webhook_scheduler(p_dispatch_url,p_worker_secret)->bigint`: trusted setup; Vault URL/key, named30-second cron job.

TypeScript: `dispatchWebhookBatch(store, options?)->{claimed,completed}`, `signHermesWebhook(secret,timestamp,rawBody)->hex`, `validateWebhookTarget(url,resolver?)->validated target`, `databaseDeliveryStore(url,serviceRoleKey)`. Injection is for tests; production entrypoint always constructs the pinned transport with strict default resolver and max10s deadline. Store failures leave the SQL lease for recovery and return safe503.

Task7 must apply reviewed migration004 locally/hosted, deploy Edge function/config, set private worker env + Vault scheduler credential, provision signing secret/recipient connection via private CLI after DNS/TLS exists, configure only main Hermes profile with scoped `mcp-task_manager` toolset and log destination through existing Traefik. `docs/hermes-integration.md` has exact env names, commands, prepared route, limits and rollback. Preserve Lili. Do not print/upload secrets. No actual secrets were used in source/tests or sent to the browser.

## Remaining gates / limitations

Independent controller review is pending; no self-approval claim. Source migration004 is **not applied to the shared review stack**; it was tested in disposable real-extension instances, so Task5 must not assume local webhook RPCs are already installed. Shared OAuth suite still passed against Task3's existing schema. No remote setup or actual signing/worker secrets provisioned. User creates Hermes DNS later; hosted Edge TLS/egress/deployment, proxy routing and actual external Hermes acceptance remain specifically unverified activation gates. Consumer dedup guidance plus persistent SQL fixture do not implement Hermes's durable production side effects. Finite delivery does not mean guaranteed success or exactly-once effects. Existing idempotency/domain operation parity is unchanged; Task4a owns that separate work.

## Frozen source commit

`bdb9e2619038bbb27daeda145252a7eded4d766d`

`feat(webhooks): deliver signed task events to external agents`

After commit, only the controller-owned plan remains dirty. All worker-created disposable containers/networks were removed; the shared review stack was not migrated/reset. Ready for independent review.

## Independent review correction: round1/5

Fix base `bdb9e2619038bbb27daeda145252a7eded4d766d`. Full review read from `task-4-review.md`. All3 Important findings and the optional Minor isolation evidence gap were addressed. This section supersedes the earlier claim that the initial lock predicate alone guaranteed nonexpired leases, and the earlier immediate crash-replacement behavior. No Task4a/domain-operation changes, new dependencies, remote actions, shared schema application or subagents. Controller plan edits preserved.

### Diagnoses and changes

1. **DNS availability is separate from destination policy.** `DnsResolutionUnavailable` produces the safe persisted category `dns_unavailable`. Invalid URLs and proven prohibited/private/mixed addresses remain `TargetRejected`/terminal. DNS timeout/SERVFAIL/other resolver failures or no A/AAAA addresses cause a finite retry, without opening a socket or storing resolver diagnostics. The default production A/AAAA resolver gathers both outcomes: any proven prohibited address wins even if the other family failed; a missing family (`NotFound`) is acceptable when the other family has public answers, while both missing or an incomplete resolution with transient error is unavailable. SQL explicitly validates and retries the new category with the existing budget/floors. RPC signatures, secrets and authorization are unchanged.
2. **Lease time is checked after acquiring the actual row lock.** Both `webhook_delivery_secret` and `complete_webhook_delivery` retain the id/state/token selection and `FOR UPDATE`, then reject NULL/expired returned leases using a fresh `clock_timestamp()`. Time no longer appears only in the pre-wait predicate. Denial occurs before Vault access, audit/state mutation or queue acknowledgement. Replaced token/state still cannot match.
3. **Interrupted reservations retain a fixed backoff deadline.** Before I/O, each reservation now saves a crash fallback `next_attempt_at = lease_until + backoff[attempt]` (the8th uses its lease deadline solely for terminal recovery). When an expired processing lease is observed, its attempt is closed as `lease_expired`; at8 it archives/fails without another reservation. Otherwise SQL clears the old lease, sets pending and uses `greatest(stored_due, expired_lease_until + backoff)` as the fixed deadline. Queue visibility is aligned by rounded-up seconds; an early poll never spends another attempt or continually restarts the delay. The normal reported failure path still uses response completion time + normal/Retry-After delay. Interrupted work can resume immediately if its absolute fallback deadline already elapsed during downtime, but never before it. Live lease visibility aligns with remaining lease time rather than adding another arbitrary60seconds each poll.
4. **Second-workspace behavior is now exercised.** A distinct owner/client/connection/executor/subscription/Vault secret and failed delivery are created for B. Under `SET ROLE authenticated`, owner A cannot list B, configure B using either workspace ID, list B deliveries, replay B using either workspace ID, call the secret worker RPC or read its secret reference. B's configuration/replay counter/secret stay unchanged. No production permission change was needed.

Research confirmed the review's root causes before SQL fixes: PostgreSQL17 [Read Committed](https://www.postgresql.org/docs/17/transaction-iso.html#XACT-READ-COMMITTED), [fresh clock semantics](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT), and [Deno DNS API](https://docs.deno.com/api/deno/network/). There was no speculative transport replacement or retry-architecture expansion.

### RED evidence: production paths

```
deno test --unstable-no-legacy-abort --config supabase/functions/deno.json \
  --allow-env --allow-net --filter 'DNS timeout' \
  supabase/functions/tests/webhook-delivery.test.ts
0 pass /1 fail /7 filtered
actual timeout/empty => target_rejected,null; expected dns_unavailable,30
```

`/tmp/task4-r1-dns-red.log`. An initial assertion generic was widened to `unknown` so the new expected enum value could be compared against the old typed union; the saved RED is the actual behavioral assertion, not a TypeScript compile failure.

```
WEBHOOK_REVIEW_CASE=secret-lock node supabase/tests/webhook-postgres.mjs
FAIL secret-lock: production RPC accepted a lease that expired while awaiting its lock
WEBHOOK_REVIEW_CASE=completion-lock node supabase/tests/webhook-postgres.mjs
FAIL completion-lock: production RPC accepted a lease that expired while awaiting its lock
WEBHOOK_REVIEW_CASE=crash-backoff node supabase/tests/webhook-postgres.mjs
FAIL interrupted attempt1 must not immediately reserve its successor (actual attempt2)
```

`/tmp/task4-r1-{secret,completion,backoff}-red.log`. These run the **actual migration/RPCs** on disposable official Supabase PostgreSQL17.11, not a simplified illustrative function. Two persistent independent sessions hold an unchanged delivery row and call the real secret/completion RPC; `pg_blocking_pids` proves the caller is waiting, and SQL clock observation proves expiry before releasing the holder. Only booleans are returned for secret access; no plaintext secret is printed. The crash test expires **only the lease**, makes pgmq visibility observable and leaves due time intact before asserting no reservation. Existing fixture-only time advances happen only after that no-early-reservation proof.

### GREEN regression coverage

The same3 focused commands passed after the correction: `/tmp/task4-r1-{secret,completion,backoff}-green.log`. The normal Node integration now automatically runs all3 regression scenarios every time, so they are not opt-in-only tests. The8-crash test covers each of30/120/600/1800/7200/21600/86400 seconds, persistent pending state, unchanged counters before due, queue visibility within1second above ledger due, fixed deadline across early polls, a new reservation only after simulated due, and terminal8th interruption. The two lock tests also require unchanged state/token/queue after stale rejection. Each isolated test's sessions have bounded timeouts and containers/networks are removed.

```
node supabase/tests/webhook-postgres.mjs
PASS real extensions +3 production regressions +second-workspace isolation
PASS actual PostgREST DNS timeout => pending/dns_unavailable/future retry, zero HTTP sends
PASS existing HMAC503/200/lost-ack replay +SQL consumer dedup +Cron recovery
```

`/tmp/task4-r1-runtime-green.log`. The live PostgREST test explicitly observes persisted DNS retry state before advancing fixture time. The existing private-target Cron scenario and Deno mixed/private matrix still terminate, so DNS retries do not weaken SSRF. The reusable test-only time advance now moves the expired lease into the past as well as due time **after** the independent production backoff assertions; it no longer defeats the new floor accidentally. None of these helper functions are in production migrations or deployed functions.

```
TEST_WEBHOOK_COVERAGE_DIR=/tmp/task4-r1-coverage npm test
66 tests /65 pass /0 fail /1 pre-existing unconfigured cloud skip
```

`/tmp/task4-r1-final-npm.log`. One full broad Node run after final source changes; no second broad run once it passed. Its webhook testcase executes all new SQL contention/crash/isolation/DNS persistence cases plus prior queue/Vault/Cron/receiver behavior.

```
DENO_CERT=/tmp/task4-webhook-tls/cert.pem \
TEST_WEBHOOK_TLS_DIR=/tmp/task4-webhook-tls \
deno test --unstable-no-legacy-abort --config supabase/functions/deno.json \
  --allow-env --allow-net --allow-read=/tmp/task4-webhook-tls \
  --coverage=/tmp/task4-r1-coverage supabase/functions/tests/
22 pass /0 fail /2 ignored
```

`/tmp/task4-r1-final-deno.log`. Includes9 delivery/signing/DNS tests and2 real native TLS/timeout tests. The2 ignored cases are existing shared local Auth/HTTP and OAuth PKCE integration, deliberately not supplied shared credentials in this correction's disposable-only verification. Their previous Task4 evidence remains historical; this round does not claim a fresh OAuth exchange. Default resolver tests invoke `resolvePublicDns` itself with test-scoped restoration of Deno's DNS method, not merely an injected resolver that bypasses the production A/AAAA classifier. The separate persistent PostgREST fixture uses synthetic isolated Auth/role fixtures, as before.

```
node supabase/tests/webhook-edge.mjs
PASS exact Edgev1.77.4: credential matrix401/401/401/401/200;
public HTTPS POST original hostname example.com;
validated literalIP104.20.23.154 == requested peer == actual peer; HTTP405
```

`/tmp/task4-r1-final-edge.log`. The DNS address changed naturally between runs. This smoke verifies current production DNS/pinned transport on the exact local Edge image, still not Hermes acceptance or hosted004 deployment.

```
deno lint --config supabase/functions/deno.json \
  supabase/functions/_shared/webhook-*.ts supabase/functions/tests/webhook-*.test.ts \
  supabase/functions/webhook-dispatch/index.ts supabase/tests/webhook-dispatch-live.ts
deno check --config supabase/functions/deno.json \
  supabase/functions/webhook-dispatch/index.ts supabase/tests/webhook-dispatch-live.ts
npx prettier --check supabase/tests/webhook-recovery.mjs \
  supabase/tests/webhook-postgres.mjs docs/hermes-integration.md
deno fmt --check --config supabase/functions/deno.json \
  supabase/functions/_shared/webhook-*.ts supabase/functions/tests/webhook-*.test.ts \
  supabase/tests/webhook-dispatch-live.ts
git diff --check
PASS
```

`/tmp/task4-r1-final-{denolint,denocheck,format}.log`. Initial ordinary `npm run lint` reported30 `no-undef` errors solely in the controller-created frozen deployment copy under `.superpowers/sdd/.../deploy-runtime-stage3-reviewed`; saved raw evidence `/tmp/task4-r1-final-eslint.log`. Consulted [ESLint's ignore behavior](https://eslint.org/docs/latest/use/configure/ignore); product lint with `npm run lint -- --ignore-pattern '.superpowers/**'` passed (`/tmp/task4-r1-final-productlint.log`) without changing repo config or another author's files. Controller later moved that scratch copy outside the worktree; ordinary `npm run lint` then passed (`/tmp/task4-r1-final-eslint-clean.log`). The raw failure was not hidden or treated as a product fix.

```
deno coverage --include='.*supabase/functions/.*webhook.*' /tmp/task4-r1-coverage
95.8% lines /95.5% functions /90.1% branches (four production webhook modules)
```

`/tmp/task4-r1-final-coverage.log`, combining this round's native test and actual isolated PostgREST dispatcher run. No SQL coverage percentage claim. Frontend typecheck/build and unrelated full shared OAuth suites were not repeated because production frontend/domain/config/dependencies are unchanged.

### Self-review, interfaces and stop condition

Reviewed the final diff for URL policy vs availability distinction, precedence of proven bad addresses, lease access before/after blocking, eight-attempt accounting, persistent deadline math/queue VT, unchanged service-only privileges and stable event/body identity. No raw error/secret response was introduced. SQL creates no test helpers outside disposable fixtures. `dns_unavailable` is a new safe `lastCategory` value for Task5 to render; public RPC signatures, TypeScript Delivery/store shape and setup/env names are unchanged. Documentation now states post-lock expiry checks and fixed crash fallback semantics. Legacy immediate-crash fixture expectations were updated to first prove waiting and only then simulate elapsed time.

Migration004 remains **unapplied** to shared local/hosted databases by this worker. Controller's independent deployment of reviewed003 is unrelated and was not changed. All current SQL changes are in the reviewed migration source and disposable instances only. No remote Hermes, DNS/TLS/proxy/production consumer configuration, shared schema mutation or deployment. Prior HTTP100 and hosted/real-Hermes limitations remain. Independent rereview is required; no self-approval claim.

Round1 frozen commit: `b29c4e6c6ea2982d68ad0d5d3f9bdedc96726907` (`fix(webhooks): enforce retry and lease recovery fences`). After commit only the controller-owned plan remains dirty; all worker-owned disposable containers/networks were removed. Ready for scoped independent rereview.

## Task4 fix round2: restricted Supabase migration role (in progress)

The controller's real local migration004 attempt on base `b29c4e6` rolled back at the blanket function REVOKE: Vault's `_crypto_aead_det_encrypt` is owned by `supabase_admin`, inaccessible to the normal `postgres` migration role. No hosted004 attempt was made. This round operates only disposable containers; shared local inspection is read-only.

Official research: [Supabase role limits](https://supabase.com/docs/guides/database/postgres/roles-superuser), [Supautils delegated extension creation](https://github.com/supabase/supautils#privileged-extensions), and [PostgreSQL REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html) explain why extension creation permission does not confer ownership of all vendor primitives. The runner now uses `postgres` NOSUPERUSER for all production migrations, retains vendor-owned Vault crypto, and uses the same Supautils delegated-extension settings read from the actual CLI stack. Minimal synthetic Auth table grants model the real Auth schema ACL instead of elevating the application role. Original blanket REVOKEs reproduced the controller's error class (`_crypto_aead_det_noncegen`, catalog ordering difference) in `/tmp/task4-r2-migration-red.log`.

Removing blanket REVOKEs alone was unsafe: `/tmp/task4-r2-migration-green.log` actually FAILED `browser schema usage: anon net`. Diagnostic `/tmp/task4-r2-acl-diagnosis.log` showed `net` owned by supabase_admin, PUBLIC/anon/authenticated USAGE, and postgres USAGE without grant option. The [official pg_net installation SQL](https://github.com/supabase/pg_net/blob/v0.20.0/sql/pg_net.sql) grants PUBLIC usage/table/sequence privileges. Its transient request table includes outgoing auth headers, so this cannot be dismissed as cosmetic. The new unsafe-preinstalled fixture then reproduced a false-success migration returning0 despite ineffective REVOKE warnings (`/tmp/task4-r2-unsafe-red.log`). A post-REVOKE effective-privilege check now aborts transactionally with42501 `backend_privilege_boundary_unavailable` instead of silently accepting exposure.

A precreated application-owned `net` namespace was investigated with controller authorization, then rejected by real PG17: `schema net is not a member of extension pg_net`, `/tmp/task4-r2-runtime-green.log` (NOT a passing run). This is deliberate upstream security behavior, not an incidental setup error: [PostgreSQL schemacmds.c](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/commands/schemacmds.c#L115) calls [checkMembershipInCurrentExtension](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/catalog/pg_depend.c#L240) for IF NOT EXISTS. Precreate was removed; no catalog/dependency manipulation, vendor ownership changes or privilege escalation attempted. Controller notified that the proposed precreate route cannot work. No GREEN claim or deployment recommendation yet. Alternative supported scheduler transport or operator-managed namespace ACL needs explicit technical ruling; worker auth and the three approved round1 fixes remain unchanged.

Controller ruled to investigate supported `http` in application-owned private schema for Cron wake-up only. Isolated `/tmp/task4-r2-http-namespace-probe.log` proved `http1.6` install with restricted postgres, namespace ownerpostgres, anon/auth USAGEfalse, extension owneradmin; exact available version matches controller read-only local/hosted preflight. However version-specific research uncovered another blocker before implementation: [pgsql-http v1.6.0 source](https://github.com/pramsey/pgsql-http/blob/v1.6.0/http.c#L1060) forces redirect following for all methods except HEAD; FOLLOWLOCATION/MAXREDIRS are absent from its SQL settable option allowlist. The source differs materially from upstream1.7. `/tmp/task4-r2-http-redirect-probe.mjs` tested the actual official image's binary with POST to an entirely local fixture returning307: result200, initialRequests1, redirectTargetReceivedFixtureHeader1. Only a synthetic fixture header was used, never an actual worker secret, and the disposable container/server were removed. Thus private schema alone does not meet no-redirect credential protection. Controller notified; no insecure transport was implemented and no alternative worker-auth design assumed.

### Round2 final ruling and shipped change (supersedes the exploratory alternatives above)

The controller resolved the platform boundary using primary [Supabase pg_net permissions documentation](https://supabase.com/docs/guides/database/extensions/pg_net#permissions) and the independent opinion in `task-4-platform-boundary-opinion.md`. Keep the original supported Cron → pg_net → authenticated private Edge worker. The vendor SQL grants do not create an HTTP Data API route; API roles are NOLOGIN, and this application offers no untrusted SQL connection or arbitrary-query RPC. The original blanket vendor revokes were an erroneous implementation assumption, not a spec requirement. The precreated-net guard and http alternative are **not shipped**. There is no new HTTP transport/helper/extension or worker-auth protocol, and no weakening by claiming no-op REVOKEs succeeded.

Production SQL delta is four replacement lines: preserve vendor Vault/Cron/net ownership/ACLs; revoke on this application's `pgmq` schema and two queue tables explicitly. Existing private ledger/subscription/attempt/replay tables and service-only provisioning/secret/worker RPC grants remain intact. No DNS classification, transport, retries, leases or scheduler signatures changed from approved round1. Vault remains the durable secret store, but the dedicated worker header necessarily exists plaintext in pg_net's pending request representation and is readable by trusted direct SQL operators. It is absent from domain events, app logs, job text and client responses; it is not truthful to claim exclusively encrypted storage at every instant. No service-role credential enters Cron headers.

`webhook-postgres.mjs` now executes every production migration with actual `postgres` NOSUPERUSER on the official PostgreSQL17 image using the CLI's Supautils delegation configuration. Bootstrap-only synthetic Auth grants and pg_graphql/introspection setup happen administratively inside the disposable fixture; they do not elevate the migration role or appear in production SQL. Tests assert postgres is not superuser or a supabase_admin member; worker helpers/ledger belong to postgres; inaccessible admin-owned Vault crypto persists; the entire Vault function owner/ACL snapshot remains byte-identical across app migrations. App table/queue DML and privileged RPC execution remain denied to both API roles, with real SET ROLE statements additionally exercising Vault/queue/Cron/worker denial. The fixture explicitly asserts retained vendor net usage/read privileges and NOLOGIN roles instead of asserting fictional SQL denial.

The initial restricted-role fixture exposed one prior test-owner assumption: named Cron lookup includes current user, so admin `cron.unschedule(name)` cannot find the newly correct postgres-owned job. Researched [upstream pg_cron job lookup](https://github.com/citusdata/pg_cron/blob/main/src/job_metadata.c#L636); tests now clean up by job ID and assert job usernamepostgres. The test-only scheduler preparation/stop functions also belong to postgres, preserving that owner when shortening the fixture tick to1second. Production remains30seconds. The resulting real Cron → pg_net → production auth handler → service RPC queue claim passes with a missed503 wake-up followed by200 recovery. No vendor ownership/ACL manipulation was added to the migration.

### API/GraphQL exposure evidence and audit

Fixture configuration is explicit and shared between the runner and auditor: exposed schemas `public,graphql_public`; extra search path `public,extensions`; PostgREST db-configfalse prevents hidden fixture overrides. The auditor rejects unknown configuration, extra sensitive schemas and unknown/unsafe extra search paths. Deployment activation must establish the **actual** configuration separately, including GraphQL; no SQL migration pretends to infer the running API configuration.

The new `webhook-api-boundary.mjs` inventories all functions and views/materialized views in both exposed schemas, including INVOKER and DEFINER functions. It starts with each anon/authenticated-callable root and follows source references to private helpers/views. It checks38 reachable production objects, rejects sensitive extension bridges and flags new dynamic SQL. Negative catalog fixtures prove INVOKER direct access, an exposed DEFINER calling an inaccessible helper, and a view of vendor headers all fail the audit. They are dropped before REST/GraphQL startup. This is a focused source/catalog regression aid for the reviewed surface, not a general SQL parser or an automatic proof about arbitrary future dynamic SQL.

Two existing domain functions use reviewed dynamic `EXECUTE format`: `operation_graph` and `read_operation`. Their table names come from fixed operation/entity case maps, column expressions from fixed allowlists and values through USING; they do not accept SQL text or arbitrary schema/table names. The intentional administrator `retry_webhook_delivery` bridge calls `webhook_admin`, rechecks the delivery's active connection, and sends only its fixed delivery UUID to the fixed application queue. The audit permits that exact reviewed call, not a generic sender/reader. Safe list/configuration/replay RPCs retain their existing identity/workspace validation. Private secret/provision/worker helper chains are not callable user roots. Native GraphQL's exposed wrapper is the supported extension resolver and is separately exercised over HTTP, rather than inferred from source scanning or REST406.

With anonymous, authenticated-human and OAuth-shaped JWTs, real PostgREST verifies:

- `Accept-Profile` GET and `Content-Profile` POST reject `net`, `vault`, `pgmq`, `cron` with406/PGRST106.
- Seven default-schema sensitive relation aliases reject with404/PGRST205; six vendor RPC aliases reject with404/PGRST202.
- Five actual public worker/secret/completion/provision/scheduler RPCs reject access with valid argument shapes, not merely nonexistent endpoints.
- Error responses return no fixture signing/worker key.
- Actual enabled native pg_graphql through `graphql_public.graphql` returns a valid introspection schema without protected table/type/private-RPC entries, and direct sensitive collection queries fail for all three principals. The fixture alone enables introspection. Safe human list RPCs legitimately remain visible and were not mistaken for private base-table exposure.

This is fixture JWT role/client-claim coverage, not a new Auth-server PKCE exchange or proof of hosted configuration. Current deployed settings, functions/views and GraphQL/search-path must be rechecked by Task7. Unknown exposure or any arbitrary SQL bridge blocks activation; adding direct untrusted SQL access invalidates this boundary.

### Exact RED/GREEN commands and final checks

Before source correction, with the new restricted-role runner:

```
node --test tests/webhook-sql.test.js
RED: 1 failed, actual vendor-owned Vault primitive permission error42501
```

`/tmp/task4-r2-migration-red.log` reproduces `_crypto_aead_det_noncegen`; controller's original local failure used `_crypto_aead_det_encrypt`, the same unsupported blanket vendor-function operation. Supautils creation delegation was researched/configured before this run; the role was not made superuser.

Exploratory REDs and rejected alternative probes are retained above, explicitly not counted as GREEN. Initial new audit rejected the intentional bounded admin replay; code inspection confirmed the existing workspace/admin/active-connection predicates before adding the narrow exact-call exception. An initial REST startup check accepted a listening503 before the schema cache was ready; after consulting [PostgREST errors/configuration](https://docs.postgrest.org/en/v14/references/errors.html#group-0-connection), the fixture now waits for successful root HTTP readiness. No product behavior was changed for either fixture issue. The first GraphQL schema assertion overmatched the safe `listWebhookSubscriptions` RPC name; the final check examines individual type/field names with anchored protected-name matches and retains direct forbidden-field queries.

```
node supabase/tests/webhook-postgres.mjs
GREEN: exit0
PASS restricted migration role and vendor-owned crypto/unchanged Vault ACLs
PASS explicit exposure/search-path and INVOKER/helper/view negative audit cases
PASS anon/human/OAuth real REST and enabled native GraphQL boundary
PASS both lease-lock regressions and crash-backoff/queue alignment
PASS second-workspace behavioral isolation
PASS real Cron(pg usernamepostgres) -> pg_net -> private handler503/200 recovery
PASS existing HMAC retry/lost-ack stable bytes/ID +consumer dedup effect1
```

`/tmp/task4-r2-graphql-green.log` contains the focused full runtime proof. Runtime versions include pgmq1.5.1, Vault0.3.1, Cron1.6.4, pg_net0.20.4 on `public.ecr.aws/supabase/postgres:17.11.0.003`, plus real PostgRESTv14.18 and enabled packaged native pg_graphql. The final runner additionally uses shared exposure/search-path constants and disables db-config overrides.

```
npm test
66 tests /65 pass /0 fail /1 pre-existing unconfigured cloud skip
```

`/tmp/task4-r2-final-npm.log`, exit0, final source,20.3seconds. Includes the restricted PostgreSQL/real REST+GraphQL/Cron suite again through the project's ordinary test wrapper. This is the only broad Node run in round2 after source freeze; no repeat after passing.

```
npm run lint
npx prettier --check supabase/tests/webhook-postgres.mjs \
  supabase/tests/webhook-api-boundary.mjs docs/hermes-integration.md
git diff --check
PASS
```

Ordinary lint exit0 in `/tmp/task4-r2-final-lint.log`; no ignore workaround or product config changes. Initial lint caught two unqualified Node `fetch` references in the new test module; changed to `globalThis.fetch` consistently with the existing runner, then reran clean. Prettier and diff-check passed final source. No production TS/Edge module changed, so the unchanged Deno/native TLS/exact Edge smoke was not repeated in this ACL compatibility round; original/round1 transport evidence remains historical, not newly claimed.

### Round2 self-review and handoff

Reviewed the final production diff, explicit app grant boundaries, restricted migration ownership, fixed-vs-vendor ACL claims, real principal/API routes, native GraphQL results, audit transitive traversal, fixture owner/readiness changes and sensitive output handling. Only six worker-owned product/test/doc files will enter this fix commit. The controller's plan edits and local scratch opinion/report remain unstaged. All worker-owned disposable containers/networks/probe servers were removed. No shared/hosted migration, deployment, runtime secret or remote Hermes operation was performed by this worker.

Task5/Task7 RPC signatures, environment variables, worker auth, DTOs and scheduler cadence are unchanged. Docs now state the actual platform assumptions, transient worker header storage, restricted migration role and mandatory REST/GraphQL exposure/bridge checks before activation. The final patch remains subject to independent review and controller local/hosted application. Actual Hermes DNS/TLS/installed route/consumer acceptance still belongs to Task7; HTTP100 and previously documented transport limitations are unchanged. Stop after this conventional fix commit and final report; no Task4a/unrelated work.

Round2 frozen commit: `9585ebafa87f3ed7b307f65f9015cf7f149cf0ee` (`fix(webhooks): preserve managed extension permissions`). Commit succeeded; `git status --short` shows only controller-owned `docs/superpowers/plans/2026-10-20-agent-platform.md`. Worker-owned disposable container/network inventories are empty. Ready for scoped independent review; no self-approval or deployment claim.
