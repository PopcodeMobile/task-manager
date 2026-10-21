# Hermes task webhooks

Target: `https://hermes.deltaacademy.com.br/webhooks/task-manager`.
The user will create DNS later. No remote configuration, DNS change, TLS issuance or real Hermes acceptance is implied by the local tests below. Activation belongs to the deployment task.

## Contract

A task command commits its immutable domain event, matching subscriptions, delivery ledger and **logged** pgmq message in one transaction. The worker claims at most five deliveries concurrently. Every reservation is persisted before HTTP with a new UUID lease and a 60-second expiry. SQL rechecks lease expiry using a fresh clock after acquiring the row lock, before retrieving a Vault secret or recording a result. Restart/crash recovery uses SQL state; no in-memory acknowledgement or pg_net response is authoritative.

The versioned JSON contains only `schema_version`, `event_id`, `event_type`, `occurred_at`, `workspace_id`, `task_id`, `task_version`, `actor_id`, `connection_id`, `correlation_id`. IDs and exact body bytes stay stable across retries and manual replay. `correlation_id` and `X-Request-ID` equal `event_id`. Context is fetched separately using the connection's authorized MCP tools.

The dispatcher signs the UTF-8 `<unix-seconds>.<raw_body>` using HMAC-SHA256 and sends lowercase hex in `X-Webhook-Signature-V2`, plus `X-Webhook-Timestamp`. Each attempt creates a fresh timestamp/signature. Hermes allows a five-minute timestamp window. Never reserialize the body before verification. [Generic V2 documentation](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks).

Initial mappings: a task claim or human intervention leaving an executor produces `task.assigned`; task comments produce `task.comment_added`; completed/done work produces `task.completed`; blocked work produces `task.run_blocked`; other task mutations produce `task.updated`. These notifications reflect the existing domain operations, not additional mutation endpoints. Executor filtering defaults on. The receiving agent's own events are always excluded.

## Retries, deduplication and recovery

There are eight reservations per delivery cycle, including reservations interrupted by worker crashes. Seven backoffs are 30 seconds, 2 minutes, 10 minutes, 30 minutes, 2 hours, 6 hours, 24 hours. A 30-second scheduler tick adds polling latency. Each reservation also persists a crash fallback deadline at lease expiry plus its normal backoff; recovery closes the interrupted attempt, clears its lease and aligns queue visibility with that deadline. Early polling neither spends another attempt nor extends the fixed wait. Each attempt has one ten-second budget including secret lookup, DNS, connect, TLS, headers and body. `408`, `429`, `5xx`, network failures, temporary DNS failures or absent answers (`dns_unavailable`), timeouts and missing configuration retry. Proven prohibited or mixed public/private answers remain terminal, including when another DNS family fails. Other `4xx`, redirects and rejected destinations terminate. A valid `Retry-After` integer or HTTP date can extend the backoff, capped at 24 hours. SQL independently enforces the backoff floor, cap and eight-attempt limit.

Responses retain only an internal category and HTTP status, never body text, location, headers, credentials or transport errors. Attempt history and queue archives remain in PostgreSQL without automatic deletion. Capacity/retention policy can later be configured explicitly; do not silently purge deduplication history.

At-least-once delivery allows duplicates: the receiver might accept work before our acknowledgement commits or before a timeout. The pinned normal Generic V2 runtime (`493208879a3248c6a4b844981d2c31c78ae00929`) uses persistent SQLite session admission. Isolated verification passed five tests: repeated and eight concurrent deliveries, invalid HMAC, failed durable admission, and a genuine OS-process restart with the same database and a fresh signature. This supersedes the earlier blanket one-hour-cache statement. See [the exact isolated proof](verification/agent-platform/task-7-hermes-isolated-runtime.md).

That proof uses an isolated home and synthetic provider. It does not prove production route configuration, OAuth/MCP, retention/pruning, remote effects or deployed Hermes acceptance. Before enabling side effects, verify durable admission retention exceeds all retry/manual replay horizons. Local effects need transactional receipts; remote effects need deterministic idempotency keys and a recoverable consumer outbox. HTTP acceptance is not completed agent execution, and the finite delivery budget does not guarantee eventual processing.

Human owner/admins can replay **failed** deliveries with `retry_webhook_delivery`. Replay preserves event/body/total attempt history, records the human actor, increments `replayCount`, and grants a new finite cycle. Pending/processing/succeeded/cancelled deliveries cannot be replayed through that RPC. Fix the destination/configuration before replaying a terminal failure.

## Authorization and destination safety

A subscription binds the existing active OAuth connection and its server-owned workspace write-grant executor. It cannot invent an agent identity. Current connection status, grant, Auth consent/client and workspace membership are checked during fanout, reservation, secret retrieval and completion. Revoke/disable blocks new work; queued work is cancelled at the next claim. A request already carrying its secret and in flight can still reach the old destination. Completion after observed revocation is marked cancelled. No database lease can retract bytes already sent.

Only direct human owners/admins can list subscriptions/deliveries, configure safe options or request replay. OAuth, members and guests cannot administer them. Browser responses omit secrets and Vault IDs. Initial provisioning, destination changes, rotation and scheduler setup use the trusted CLI/service-only RPCs below. The service credential and dedicated worker secret must never enter frontend environment variables.

Subscription setup and every attempt require a public HTTPS DNS hostname, default port 443, no userinfo, fragment or query credentials. IP literals and special-use DNS/IP ranges are rejected, including mixed public/private A/AAAA answers. Each attempt resolves again and approves **all** answers. The standard pinned `undici@7.30.1` connector receives only the approved literal IP, preserves the original TLS hostname/certificate verification and Host header, and creates/destroys a client per attempt. It never reconnects to `Location`. Headers are bounded at 16 KiB, bodies at 64 KiB. DNS failure or unsupported transport fails closed without opening a socket; temporary resolution failures use the finite retry budget. Undici rejects unsolicited `100 Continue` as a network/protocol failure; `103` followed by a final response is parsed normally. No application HTTP parser or preflight-DNS plus ordinary fetch is used.

The Edge function uses `verify_jwt=false` because it checks **only** `X-Webhook-Worker-Key` against `WEBHOOK_WORKER_SECRET`. Missing/wrong keys, public API keys and user JWTs cannot drain the queue. SQL worker RPCs are granted only to `service_role`; ordinary OAuth/JWT calls cannot use them. Cron reads the worker key and URL from Vault at invocation; job text contains only Vault IDs. pg_net is an expendable periodic wake-up, not the delivery ledger.

Supabase manages the vendor extension ACLs: `net` retains PUBLIC SQL access to its transient request/response tables. The pending request contains the worker header in plaintext until execution; trusted database operators can inspect it. Vault is the durable secret store, and the Edge environment also holds the worker key. No service-role credential is placed in Cron headers. This design relies on the configured API boundary and audited application RPCs, with no untrusted SQL login or arbitrary-query endpoint. It does not promise SQL-role denial on vendor `net` objects. [Supabase pg_net permissions](https://supabase.com/docs/guides/database/extensions/pg_net#permissions).

Keep the Data API exposed-schema allowlist at `public, graphql_public` and extra search path at `public, extensions`; exclude `net`, `vault`, `pgmq`, `cron`, and any private wrapper schema. Preserve `anon`/`authenticated` as NOLOGIN. Audit callable INVOKER and DEFINER functions, views and helper chains in exposed schemas for secret/network/queue bridges. GraphQL uses its own search-path and privilege boundary: keep sensitive schemas out of its effective search path and test that API separately when enabled. Unknown exposure configuration blocks activation. Adding raw SQL access later requires a new security review. [GraphQL visibility](https://supabase.com/docs/guides/graphql#schema--table-visibility).

## Private setup and rotation

Apply migration `202610200004_webhook_delivery.sql` after tasks 1–3. Run migrations as the normal Supabase `postgres` role (NOSUPERUSER); the migration restricts app-owned tables/queue/RPCs and preserves vendor extension owners and ACLs. Hosted Supabase must provide pgmq, Vault, Cron and pg_net. The real local integration runner uses the official PostgreSQL image with both `pgsodium` and `supabase_vault` preloaded so encryption is actually exercised.

Create a random signing secret of at least 32 characters and a separate random worker secret. Store the signing secret only in Vault and the main Hermes profile's private route configuration. Set the worker secret as the Edge environment variable and in Vault via the scheduler CLI. Use private environment loading/password management, not command-line secret literals, browser forms or committed `.env` files.

The trusted CLI reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. For subscription setup it additionally reads `WEBHOOK_WORKSPACE_ID`, `WEBHOOK_CONNECTION_ID`, `WEBHOOK_ADMIN_USER_ID`, `WEBHOOK_TARGET_URL`, `WEBHOOK_SIGNING_SECRET`. The admin must currently own/administer that workspace; the connection must already have an active write grant. The CLI checks DNS before provisioning, so run it after the user creates DNS/TLS. Re-running for the same workspace/connection rotates that subscription's existing Vault secret and updates the destination without exposing its ID.

```sh
deno run --allow-env --allow-net scripts/setup-webhooks.ts subscription
```

For scheduling, provide `WEBHOOK_DISPATCH_URL=https://PROJECT.supabase.co/functions/v1/webhook-dispatch` and `WEBHOOK_WORKER_SECRET`, matching the deployed Edge environment. The CLI creates/updates a named 30-second Cron job. Re-run scheduler setup after rotating the worker key and updating the Edge environment together.

```sh
deno run --allow-env --allow-net scripts/setup-webhooks.ts scheduler
```

The main Hermes service hosts four profiles: default, clara, comercial and operacoes. A service restart affects all four. Configure only the approved task route after reviewing that impact; recheck the separate Lili service/profile eligibility and leave it untouched. Use the existing Traefik proxy for HTTPS and expose only the exact `/webhooks/task-manager` route. Keep the adapter port private. A prepared main-profile route, filled privately during activation, is:

```yaml
platforms:
  webhook:
    enabled: true
    extra:
      host: '127.0.0.1'
      port: 8644
      routes:
        task-manager:
          secret: 'REPLACE_PRIVATELY_FROM_SECRET_STORE'
          events: ['task.assigned', 'task.updated', 'task.comment_added', 'task.completed', 'task.run_blocked']
          toolsets: ['mcp-task_manager']
          deliver: 'log'
          prompt: 'Task event {event_id}: {event_type}; workspace {workspace_id}; task {task_id}. Read authorized context through task_manager MCP; deduplicate persistently before any action.'
```

Name the configured MCP server `task_manager` so Hermes registers `mcp-task_manager`; confirm that exact installed-version toolset exists and exposes only the task MCP server before enabling the route. Use the existing OAuth connection and approved workspace grant. No broad terminal/file toolsets, chat delivery, global tool changes or Lili restarts are part of this setup. Bind the adapter to a private interface reachable by the existing proxy (a loopback binding requires that proxy's network path to reach it; do not publish the port broadly). [Hermes MCP toolsets](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

## Safe UI RPCs

All calls use the logged-in human's JWT. Lists return JSON arrays; no base-table SELECT is authorized.

| RPC                              | Parameters                                                                                    | Result                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `list_webhook_subscriptions`     | `p_workspace_id`                                                                              | id, connectionId, agentId, targetUrl, eventTypes, filterExecutor, enabled, active, createdAt        |
| `configure_webhook_subscription` | `p_workspace_id`, `p_subscription_id`, `p_enabled`, `p_event_types`, `p_filter_executor=true` | void; only listed safe fields change                                                                |
| `list_webhook_deliveries`        | `p_workspace_id`, `p_subscription_id`, `p_before=null`, `p_limit=50`                          | newest first, up to 100, safe states/counters/status/categories; `p_before` is a creation timestamp |
| `retry_webhook_delivery`         | `p_workspace_id`, `p_delivery_id`                                                             | void; failed active delivery only                                                                   |

Configuration filters affect future fanout; disabling also stops queued work. `active` combines enabled/current connection authority. UI should display cloud-only/unavailable outside Supabase. Safe mutation failures are `PT401/PT403/PT404/PT409/PT422`; handle RPC void success without parsing an empty HTTP204 body. Initial setup/rotation stays outside the browser.

## Verification and activation gates

```sh
node --test tests/webhook-sql.test.js
node supabase/tests/webhook-edge.mjs
deno task --config supabase/functions/deno.json test
```

The SQL suite creates/removes only its own disposable official Postgres/PostgREST containers and network. It exercises real encryption, queue transactions, leases, independent workers, retries, revocation, safe RPC grants and dispatcher/HMAC receiver integration. All production migrations run under restricted `postgres`, with vendor-owned Vault primitives retained. It checks actual anon/human/OAuth-shaped PostgREST requests, enabled native pg_graphql visibility/denials, and app-owned INVOKER/DEFINER/view helper paths. Only the disposable fixture enables GraphQL introspection for this check. Its Auth rows/JWTs are synthetic database fixtures, not OAuth exchanges. Local HTTP receiver injection exists only in tests; production always uses pinned HTTPS.

The Edge smoke copies production modules into an isolated user worker on the exact local image v1.77.4. It tests credential rejection and a public HTTPS POST with the actual connected peer pinned to the validated address. Example.com's HTTP405 proves response parsing/transport, not Hermes acceptance. A separate native TLS fixture tests valid/mismatching certificates, chunked/fragmented/interim responses, truncation, limits, redirect rejection and timeout socket closure. The dedicated hosted worker deployment, API boundaries and an actual empty-queue Cron wake-up are recorded in [hosted preactivation proof](verification/agent-platform/hosted-preactivation-proof.md). Cron remains disabled. That wake-up does not prove hosted pinned outbound TLS to Hermes. User DNS/TLS, proxy routing, durable consumer side effects and actual Hermes acceptance remain activation gates; no frontend publication is implied.

Before enabling the Cron job, verify the actual deployed REST exposed-schema allowlist and GraphQL search path. With anonymous, human and OAuth credentials, require denial for sensitive-schema `Accept-Profile`/`Content-Profile` requests, default-schema vendor relation/function aliases, and direct worker/provisioning RPCs. Review the deployed function/view inventory including indirect helpers; a new generic SQL/RPC bridge invalidates the earlier audit. If GraphQL is enabled, verify its visible schema and rejected sensitive-field queries independently. Block activation when any configuration or API surface cannot be established. Local fixtures establish the tested configuration only; they do not certify hosted settings.

Operational rollback: disable the subscription through its safe RPC and unschedule only `task-manager-webhooks` using a trusted SQL session. Preserve events, delivery ledger, attempt/replay history and queue archives for diagnosis. Restore the prior privately backed-up Hermes main-profile config if activation fails; do not modify Lili or reset shared databases.

## Retention preflight and final009 source boundary

The [main retention preflight](verification/agent-platform/task-7-hermes-retention-preflight.md) is read-only evidence for installed source4932088 and main-file/default auto_prune=false. Running-process overrides/profile snapshots were not inspected; effective runtime retention remains an activation gate. Seven maximum Retry-After waits total604800seconds, before queue/lease/attempt/outage/manual-replay allowance. The117750second base-backoff sum is not a maximum horizon, and fixed7days is not established safe. No retention or service change is implied.

After root reviews and activates009, Hermes can fetch exact human instructions with existing MCP `get_task` context pages and report blocked execution through `renew_task_claim`; see the [final contract and runtime handoff](verification/agent-platform/final-fix-report.md). Current shared/hosted runtime is008; the new source's isolated proof does not activate the main profile or delivery Cron.
