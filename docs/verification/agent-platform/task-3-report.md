# Task 3 implementation report

Status: implemented, local source frozen for the controller's independent gate. No remote mutation, push, activation or external client registration outside the dedicated local stack.

Commit: `a0b22db5d0ceb80719c7ead2e69dbe2880f20ac5`
`feat(mcp): expose authenticated tools and user oauth connections`
Base: `42a4f5a2602bc894c2b3b1def07418715cf4eab8`.
Only controller-owned `docs/superpowers/plans/2026-10-20-agent-platform.md` remains dirty. This report is intentionally ignored like the earlier task reports. No subagents were used.

## Acceptance, scope and stop condition

Deliver authenticated stateless remote MCP with the 12 specified tools; bind business access to real user/client/workspace grants, not decoded request identity; expose a real independent React login/consent/connections scaffold while preserving the legacy entry. Prove actual local OAuth PKCE, read/write isolation and revocation through SQL/RPC, HTTP and MCP. Stop after the owned-file local commit and this report; independent review and remote activation belong to the controller. No Task4 webhooks or Task5 dashboard implementation.

The 30 committed files are the Task3 brief's files plus focused `tests/oauth-grants.test.js`, `playwright.oauth.config.ts`, `tests/browser/oauth-consent.spec.ts`, `scripts/setup-local-oauth.mjs`, React styles/input/button/utils and provisional Vercel rewrites. Shared Task2 auth/operation/API source and the permanently OAuth-fenced legacy RLS were preserved.

## Verified implementation and authority boundary

- `supabase/functions/mcp/index.ts`: official `createMcpHandler` / fresh server per request; official `withOAuthProtectedResource` and `withSupabase({auth:'user'})`. Asymmetric JWKS verification plus Task2 `authenticate` pins signature/user/issuer/audience/expiry, then requires delegated `client_id` and at least one currently granted workspace even for initialize/tools/list. A browser JWT alone is rejected. Each tool invokes the same `executeQuery`/`executeCommand`; the user JWT reaches PostgREST, no service role in business operations.
- `tools.ts`: `list_workspaces`, `list_projects`, `list_tasks`, `get_task`, `create_task`, `update_task`, `claim_task`, `renew_task_claim`, `release_task_claim`, `add_task_comment`, `complete_task`, `list_task_activity`. Outer arguments use `workspace_id`, `idempotency_key`, `expected_version`; `input` contains existing camelCase domain fields. Read limits default through Task2, max100. Task2 validates again and SQL enforces again. MCP schema currently exposes the common task title/description/priority/due-date fields, not every optional field in the broader HTTP API. Business failures are safe `isError` results with stable code/message/requestId and recovery instructions; no SQL, token or stack in public responses.
- Migration003: `integration_connections` is unique per user/client; `integration_grants` binds workspace+read/write+server agent to that connection. Both are RLS enabled with all authenticated/anon table privileges revoked. Only explicit SECURITY DEFINER RPCs with empty search_path are exposed. The private human check and operation authority helpers stay non-callable.
- `prepare_integration_consent(authorization_id, grants)`: requires a normal human JWT and resolves the actual pending, unexpired, user-bound authorization and client from server-owned Auth tables. It accepts no client ID/name from the browser. Membership, normalized storage and guest/read constraints are checked. The whole new selection is persisted **pending/inactive before approval**; any existing connection for that user/client becomes pending, so concurrent/repeated consent fails closed.
- The UI uses the installed Supabase OAuth API (`getAuthorizationDetails`, `approveAuthorization`, `denyAuthorization`, `revokeGrant`). `activate_integration_consent` checks the exact current pending attempt, actual approved Auth request, actual non-revoked consent and current memberships, then atomically creates server-bound executors only for write grants and activates the connection. Any SQL failure rolls back all activation/agent changes. A different user/request cannot activate it. Failed/denied UI attempts call cancel; pending connections are never authorized.
- `operation_authorize`: current membership + current connection + per-workspace grant + current Auth consent + nondeleted Auth client are checked and locked in every OAuth operation. Read grants resolve no executor and cannot write/claim even when a historical executor exists after write->read reconsent. Grant revocation, Auth consent revocation and membership removal defeat still-valid tokens. Immutable Task2 audit remains intact. Missing expected beta Auth tables/columns fail closed with safe `temporarily_unavailable`.
- `link_integration_executor(connection,workspace,name)` is an explicit owner/admin operation to label/link a consenting write connection's already server-bound executor, suitable for administratively identifying an automation connection. It never accepts a caller-invented agent identity or expands a grant. Real Hermes account configuration remains outside this task.

Exposed connection RPCs:

```
prepare_integration_consent(p_authorization_id text,p_grants jsonb)
  -> {connectionId,status:'pending'}
activate_integration_consent(p_authorization_id text)
  -> {connectionId,status:'active'}
cancel_integration_consent(p_authorization_id text) -> void
revoke_integration_connection(p_connection_id uuid) -> void
list_integration_connections() -> {items:[{id,clientId,clientName,status,createdAt,
  grants:[{workspaceId,workspaceName,capability}]}]}
link_integration_executor(p_connection_id uuid,p_workspace_id uuid,p_name text)
  -> {agentId,connectionId}
```

## React/UI handoff for Task5

`react.html` -> `src/app/main.tsx` -> `AuthProvider` -> `App`. No legacy state, renderer or listener imports. `index.html` stays default. Focused Vite dev+preview middleware and Vercel rewrites send direct `/oauth/consent`, `/integrations`, `/login` requests to `react.html`; consent query survives login and reload. The real production build contains both entries.

Design plan applied: existing Geist typography; `--bg` #fbfaf8, `--text` #1d1c1a, `--border` #e9e7e2, existing indigo #4b5bd6 and existing semantic error surface. Left-aligned readable centered column, compact workspace access rows, allow/deny as the main action. Existing public sizing/spacing/type/radius tokens are reused; shadcn semantic colors are mapped through Tailwind. Slot/CVA button and native accessible input/form/select/fieldset/checkbox controls have visible focus, disabled/loading/error/empty states. Known OIDC scopes are translated to meaningful PT/EN labels (for example, identify your account). Auth client names are text, no external client logo fetch.

Exports for Task5: `useAuth()` gives `{session,loading,configured}`; `supabase` is `SupabaseClient|null`; integration client exports `rpc<T>`, `workspaces`, `authorizationDetails`, `decideConsent`, `safeOAuthRedirect`, typed workspace/grant/connection shapes. Config uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` or publishable key. Missing config displays an explicit unavailable-cloud message and disabled login, without pretending integrations work. Portuguese default, English and existing light/dark token system supported; scaffold preferences currently use independent `gr8r-react-locale` / `gr8r-react-theme` keys. Task5 can consolidate preferences during the full cutover.

Screenshots captured and visually inspected:

- `/tmp/task3-react-consent.png` (real requesting client, workspace selected, write capability, meaningful OIDC label)
- `/tmp/task3-react-auth.png` (direct auth entry)
- `/tmp/task3-react-connections.png` (revoked connection and granted capabilities)
- `/tmp/task3-react-mobile-dark.png` (390px English/dark invalid-request state)
- `/tmp/task3-built-preview.png` (built preview direct consent reload)

Baseline inspected: `/tmp/task-manager-before-react.png` and existing auth CSS/tokens.

## RED evidence and corrections

- `node --test tests/oauth-grants.test.js`: 3 failed, missing OAuth grants migration. `/tmp/task3-grants-red.log`.
- `deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/tests/mcp.test.ts`: failed, missing MCP module. `/tmp/task3-mcp-red.log`.
- `npx playwright test --config playwright.oauth.config.ts`: failed because direct `/oauth/consent` did not render the React login. `/tmp/task3-ui-red.log`.
- Edge regression: public discovery initially advertised Docker-internal URLs. Added forwarded-origin regression, observed failure, then used the official middleware's Edge derivation with explicit native overrides; public metadata now matches Auth discovery. `/tmp/task3-edge-red.log`.
- Incompatible Auth beta schema regression initially exposed a missing-relation database error. Added safe failure boundary and proved denial with `temporarily_unavailable`. `/tmp/task3-auth-schema-red.log`.
- Full npm suite caught raw sizing/type declarations in the new CSS. Read the repository token guard and replaced those declarations with existing tokens/scale derivatives. Final token guard and full suite pass.
- Real PKCE setup needed fresh CLI credentials after enabling ES256; stale pre-restart HMAC service credentials were accepted by Auth admin but rejected by PostgREST. Switched tests to fresh private status instead of weakening token validation.
- Local bootstrap smoke found CLI2.121 requires an existing configured signing-key array even for generation. Script now initializes private `[]` and runs official `gen signing-key --append`, preserving existing keys. A clean temporary project and repeated invocation both passed, with mode0600 and no key emission. The review stack's private key file matches the running Auth key; no remote key action occurred.
- Test harness fixes: consume204 as an empty response; type SDK SupabaseClient explicitly; import a private negative-fixture JWK with signing usage. Success-flow credentials always came from real OAuth code exchange. Cleanup removes disposable claims before deleting their workspace due the existing agent/claim FK ordering. Abandoned Task3-only artifacts from failed test setup were cleaned, without selecting other workspaces/accounts.

## Final GREEN evidence

```
npm test
62 tests / 61 pass / 0 fail / 1 pre-existing unconfigured SDK cloud skip
npm run lint
PASS
npm run typecheck
PASS (React, components, domain types and OAuth Playwright config/tests)
npm run check:tokens
Token audit passed: 234 public tokens, 93 source files checked
npm run build
PASS, both index.html and react.html emitted
```

Logs: `/tmp/task3-{npm,lint,typecheck,tokens,build}-final.log`. The Node suite contains all6 grant behavior regressions, including cross-attempt/guest/schema/privilege/reconsent checks. The existing skipped SDK cloud test is **not** verification of hosted behavior.

Deno credentials were supplied only in the process environment from `/tmp/task3-local-status.json` using `/tmp/task3-run-deno.mjs`:

```
node /tmp/task3-run-deno.mjs --coverage=/tmp/task3-deno-coverage supabase/functions/tests/
13 pass / 0 fail / 0 skipped
TEST_MCP_URL=http://127.0.0.1:61921/functions/v1/mcp \
  node /tmp/task3-run-deno.mjs supabase/functions/tests/oauth.test.ts
1 pass / 0 fail (actual local Supabase Edge transport)
```

`/tmp/task3-deno-final.log`, `/tmp/task3-oauth-edge-final.log`.

The real test creates2 Auth principals through local admin setup, signs in normally, dynamically registers one public OAuth client, obtains2 PKCE codes for that same client, approves distinct workspace grants, exchanges both with real verifiers, and refreshes a real refresh token. It invokes **all12 tools positively** over the official MCP client/HTTP transport, including create/claim/renew/update/comment/activity/release/reclaim/complete. It checks wrong-workspace denial, readonly write+claim denial/no executor, server-bound write executor, normal browser JWT rejection by MCP, legacy base/snapshot fencing, connection revocation at API+MCP+directRPC, membership revocation at the same boundaries, write->read reconsent, and independent Auth consent revocation. Separate locally signed **negative fixtures only** prove expired/wrong issuer/wrong audience401; those fixtures are never represented as OAuth exchanges. All business calls use the human/delegated token; service-role use is restricted to disposable setup/cleanup.

Deno coverage: **86.7% lines / 100% functions / 80.5% branches** over local runtime TS, MCP index98.5% lines, tools100% lines. HTML/LCOV `/tmp/task3-deno-coverage`. This does not count SQL/React coverage or establish a latency/load target. Deno's native test server emits its known legacy request-signal notice; actual Edge run passes without that native-server notice.

```
node /tmp/task3-run-ui.mjs
4 pass / 0 fail
```

`/tmp/task3-ui-final.log`: direct URL+reload; real login/workspace/write/approve/code exchange/revoke; real deny+state roundtrip/no active grant; invalid request+English/dark/mobile; injected activation503 after actual Auth approval leaves revoked connection and no executor. No production secrets in the browser or trace.

Built preview on5181 was opened with Playwright: direct consent URL and reload rendered React login, `/` retained legacy `#app`. Scoped Prettier check, Deno fmt/lint/check, git diff whitespace and staged-file secret-literal scan passed. 30 staged files, no secret-literal findings. No new schema reset, unrelated container stop/prune, or remote changes.

## Local runtime and bootstrap for controller/Task6

Dedicated project remains `task-manager-review`, API61921 / DB61922, review source migration003 applied LOCAL. Final safe function refresh `/tmp/task3-local-functions.sql` also applied locally. Existing Task1/Task2 rows were not reset. Migration journal/remote apply remain controller-owned.

**Use fresh private `/tmp/task3-local-status.json` (0600)**. The earlier `/tmp/task-manager-agent-local-status.json` was preserved but its signing credentials are stale after the authorized ES256 local restart. Do not print either file. Local public runtime config is in ignored `.env.local`, including Vite public URL/anon key and `AUTH_ISSUER=http://127.0.0.1:61921/auth/v1`. No service key in frontend env. Private local signing array is ignored `supabase/.temp/task3-signing-keys.json` (0600).

Clean-clone sequence (never commit or print the generated material):

```
npm ci
npm run local:oauth:key
supabase start
umask 077
supabase status -o json > /tmp/task-manager-local-status.json
```

`local:oauth:key` generates via the official CLI, writes only the ignored configured path, and preserves an existing key. Verified in a clean temporary project and repeated invocation. Config cannot start without this private file; bootstrap is mandatory. Later CI can call the same script before `supabase start`. No static private key is needed in git.

For native Deno set `SUPABASE_URL`, public key and exact `AUTH_ISSUER`. For local Edge explicitly supply `AUTH_ISSUER` because its internal `SUPABASE_URL=http://kong:8000` is not the public issuer. Official middleware uses the injected `SUPABASE_JWKS` inside Edge; it must not attempt loopback JWKS from the container. Native runtime uses issuer JWKS URL. Public discovery uses forwarded Edge origin by default; custom domains need explicit `MCP_RESOURCE_URL`/`AUTH_ISSUER` consistent with Auth discovery. Background dedicated function serve was started with `supabase functions serve --env-file .env.local` (log `/tmp/task3-edge-serve.log`, session46717); preview on5181 session92534. Vite5180 was managed by Playwright and exits after tests. Ports5173/5174 were untouched. Root may stop preview/serve after review; do not stop unrelated stacks.

Environment flags for committed tests: OAuth live test expects `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`; optional `TEST_OAUTH_SIGNING_KEYS` is private local JSON for negative fixture signing; `TEST_MCP_URL` selects actual Edge instead of the native HTTP server. Existing Task2 live test uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_KEY`, exact `AUTH_ISSUER`. Browser live tests use the first3 TEST envs plus Vite public env. Without env the live tests are explicitly ignored, never claimed verified.

## Exact limitations / independent-review focus

1. OAuth Server remains beta. Grant RPCs deliberately depend on the verified local `auth.oauth_authorizations` (`pending`/`approved`/`denied`, user/client/expiry), `auth.oauth_consents.revoked_at` and `auth.oauth_clients.deleted_at` schema. Missing expected tables/columns fail closed. Hosted Auth schema compatibility must be verified before remote migration/activation; native public OAuth API verification alone cannot prove that internal schema contract.
2. No real Claude Desktop or Hermes deployment was connected. Two actual OAuth principals with the official protocol client simulate their delegated flows; this proves local OAuth/MCP interoperability, not a vendor UI or external network deployment. Controller still owns the real-client activation gate.
3. UI lists the application's persisted connection status. Revoking Auth outside this panel blocks operations immediately, but that persisted displayed status can remain active until panel revoke/reconsent. Panel revoke blocks SQL first, then requests Auth revoke. The Auth revoke request is best effort; business access is already denied if it fails.
4. Like any committed RPC, response loss after a successful activation can leave an approved connection whose successful response was not received. Pending/failed database activations never authorize; ordinary UI failure cleanup revokes the attempt, and users can always inspect/revoke via the panel. There is no distributed transaction spanning browser, Auth and PostgREST.
5. Consent choice loads the first100 normalized workspaces; full dashboard/local-demo parity, shared legacy preference migration and deeper connection administration remain Task5/6. No hosted cloud configuration is silently replaced with demo data.
6. No p95/load benchmark or complete React coverage measurement. SQL security is proved by PGlite behavior plus real local PostgreSQL/PostgREST/OAuth, not a JavaScript coverage percentage. No whole PostgreSQL disposable suite rerun was needed for unchanged Task1/Task2 source; full Node and all Deno suites passed.

## Primary sources consulted

- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- https://supabase.com/docs/guides/auth/oauth-server/token-security
- https://supabase.com/docs/guides/ai-tools/byo-mcp
- https://ui.shadcn.com/docs/installation/vite
- https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING
- Installed official SDK declarations were checked for actual OAuth methods, middleware env/issuer/audience/JWKS, MCP transport and handler interfaces. Existing Vite6.4.4 retained; React19.2.9, TypeScript5.9.3 and exact SDK server/client2.3.1 selected and locked. Supabase SDK2.118.0 retained. CLI config fields were verified against official CLI source and the actual local server.

## Independent review correction: round1/5

Review: `.superpowers/sdd/2026-10-20-agent-platform/task-3-review.md`.
Correction commit: `1c40d9a8db742accd4f1b2548341addd5cef2c9f`
`fix(oauth): bind consent to an immutable attempt`.
Only8 Task3-owned files changed; controller plan preserved. No subagents or remote actions.

### Verified cause and selected boundary

P1 reproduced exactly: `prepare(read)` followed by `prepare(write)` for the same pending Auth `authorization_id` silently replaced the first selection; activation consumed the latest stored grants. Cancellation by Auth ID alone could also affect a newer attempt. The prior different-authorization test did not cover that interleaving.

The correction uses **an immutable normalized selection per Auth request plus a server-issued attempt UUID**:

- `integration_connections.consent_attempt_id` is a private UUID column. `prepare` canonicalizes workspace UUIDs, rejects duplicates, checks all memberships/capabilities, locks the user/client connection, and saves the new selection. Same pending Auth request + identical normalized selection returns the same attempt UUID without changing grants. A different workspace/capability selection for that same request returns safe `idempotency_conflict`/PT409. Changing selection after cancellation/approval requires a fresh Auth request. A new Auth request rotates the attempt UUID.
- `prepare_integration_consent(text,jsonb)` now returns `{connectionId,attemptId,status:'pending'}`.
- `activate_integration_consent(p_authorization_id text,p_attempt_id uuid)` requires the exact current Auth request and server attempt UUID plus current approved Auth consent/membership. Exact activation retries may return the already active connection, rechecking authority and preserving its authorized timestamp. Revoked attempts cannot be resurrected.
- `cancel_integration_consent(p_authorization_id text,p_attempt_id uuid)` only cancels the exact **pending** attempt. A stale cancellation cannot change a newer attempt. Cancellation never revokes ACTIVE access; the explicit revoke RPC remains the only application revocation action. This is intentional for a committed activation whose response was lost.
- The unsafe single-argument activation/cancellation overloads were removed in the dedicated local patch; source migration003 creates only the new signatures. Real PostgREST tests prove old one-argument calls now return404. Helpers/table grants remain fenced.
- Browser orchestration validates the returned UUID, carries it across prepare/approve/activate/catch cleanup, and never runs generic cleanup when preparation failed or returned no valid attempt. Missing nonce from an incompatible old backend therefore fails closed before approval. Denial without a local preparation uses the Auth deny API; it cannot activate an unapproved pending attempt.
- Connection row locks serialize immutable selection comparison/update. The original shared Auth row/client locks remain shared; an unnecessary Auth UPDATE lock was avoided so preparation does not introduce an inverse lock order with activation.

The same round fixes duplicate workspace grants before insertion, with explicit `validation_error`/PT422. Real direct PostgREST response is status422, codePT422, message`validation_error`, details`null`, hint`null`, rather than23505/constraint details. The selection/connection remains unchanged on rejection.

### Browser failure semantics and UX

The original no-commit503 scenario remains covered: Auth approves, activation is intercepted **without contacting the database**, pending cleanup revokes the attempt and no executor is created.

A separate test now commits activation with a real200 backend response, then delivers a simulated503 response to the page. Exact-attempt cleanup leaves ACTIVE access intact; explicit revoke from Connections then succeeds. The UI message now accurately says the connection could not be **confirmed**, directs the user to review access in Connections, and links to that panel. It does not claim access was denied or automatically revoked. This supersedes any earlier report wording suggesting generic cleanup revokes an already committed approval.

### RED evidence

```
node --test --test-name-pattern='same Auth request|stale activation|duplicate workspace selection' tests/oauth-grants.test.js
3 tests / 0 pass / 3 fail
same Auth request: Missing expected rejection (second selection was accepted)
stale activation: server attempt UUID absent
workspace duplication: raw23505, integration_grants_pkey constraint error
```

Full evidence: `/tmp/task3-round1-red.log`. No production implementation was changed before those regressions failed.

### GREEN evidence

```
node --test tests/oauth-grants.test.js
9 tests / 9 pass / 0 fail
npm test
65 tests / 64 pass / 0 fail / 1 pre-existing cloud skip
node /tmp/task3-run-deno.mjs --unstable-no-legacy-abort supabase/functions/tests/
13 pass / 0 fail / 0 skipped
TEST_MCP_URL=http://127.0.0.1:61921/functions/v1/mcp \
  node /tmp/task3-run-deno.mjs --unstable-no-legacy-abort supabase/functions/tests/oauth.test.ts
1 pass / 0 fail (actual local Edge)
node /tmp/task3-run-ui.mjs
6 pass / 0 fail
npm run typecheck
PASS
npm run lint
PASS
npm run build
PASS, both entries emitted
```

Logs: `/tmp/task3-round1-grants-final.log`, `/tmp/task3-round1-npm.log`, `/tmp/task3-round1-deno.log`, `/tmp/task3-round1-edge-final.log`, `/tmp/task3-round1-ui-final.log`, `/tmp/task3-round1-{typecheck,lint,build}.log`. Scoped Prettier, Deno fmt/lint and diff-whitespace checks passed.

The9 SQL regressions now cover same-authorization changes in **both capability orders**, a different workspace selection, identical retry, stale activation/cancellation across a new Auth request, cleanup before/after committed activation, explicit revoke finality and safe duplicates. The existing synthetic reconsent fixtures were corrected to create fresh Auth requests rather than resetting completed requests into pending.

The real PKCE test additionally proves duplicate validation's actual PostgREST error shape, same-request conflicting preparation rejection, identical attempt retry, old overload removal and cross-user activation denial while still exercising real OAuth exchange/refresh and all12 MCP tools.

The new browser concurrency test opens2 actual pages for the same real Auth request. Tab A prepares read access and pauses immediately before the real Auth approve request. Tab B selects write and submits; its conflicting preparation fails and its cleanup cannot cancel A. Releasing A completes real approval/code exchange; resulting connection is active/read, has no executor and the issued OAuth token is denied a write. This checks the browser interleaving that the prior suite missed. The additional response-loss test distinguishes committed ACTIVE from the prior no-commit activation503 path.

### Harness warnings

Playwright config removes inherited `NO_COLOR` before Playwright sets its child `FORCE_COLOR`; the6-test green output is clean without hiding other diagnostics. Native Deno uses the runtime's documented `--unstable-no-legacy-abort` option, also added to the Deno test task. The13-test native and actual Edge logs are clean. Running native `deno test` manually without that runtime flag can still produce Deno's upstream legacy request-signal notice; it is not a functional failure and no diagnostic suppression was added.

### Local application and gate

Controller explicitly authorized the additive local patch (private UUID column + changed signatures/functions/revokes), with no reset or remote action. `/tmp/task3-round1-local-patch.sql` contains the final atomic patch from original Task3 local schema: add UUID column, drop unsafe old overloads, replace3 consent functions, restore narrow execute grants, commit and notify PostgREST schema reload. It has **already been applied** to the dedicated review stack; do not blindly rerun its ADD COLUMN. Final shared-lock prepare body was refreshed atomically in `/tmp/task3-round1-prepare-refresh.sql`. The9 focused SQL tests and actual Edge PKCE suite passed against the final bodies.

Fresh private credentials remain `/tmp/task3-local-status.json`. No reset, service credential in business operations, remote mutation or unrelated container change. The original beta Auth-schema coupling and real vendor/cloud activation gates remain exactly as reported above. Source is frozen at the correction commit for controller rereview; no Task4 work started here.

## Independent review correction: round2/5

Scoped finding: new P2 lock inversion in the previous consent fix. Previous P1/P3 findings remain addressed.
Correction commit: `64b6aec10e226562fb3c3d91d12f52509839d7a7`
`fix(oauth): order consent locks before workspace access`.
Only migration003 and focused `supabase/tests/oauth-concurrency.mjs` changed. Controller-owned plan preserved; no subagents or remote actions.

### Reproduction and smallest correction

The previous fix placed locked membership/workspace validation before the connection lock. An already authorized OAuth writer holds SHARE(connection), then `execute_operation` obtains UPDATE(workspace). Reconsent could hold SHARE(workspace), then wait for UPDATE(connection), creating a real cycle. Shared Auth row locking was not the cause of this workspace/connection inversion.

The new test reproduced PostgreSQL **40P01: deadlock detected** before implementation. It uses a disposable PostgreSQL17 container,2 persistent independent `psql` sessions and a controller observation barrier using `pg_blocking_pids`. The writer transaction pauses immediately after the real private `operation_authorize` boundary (test-admin access only), retaining its authenticated connection locks. The human session executes the actual public prepare RPC and is observed waiting for that writer. The writer then runs the actual `execute_operation` under `SET ROLE authenticated`. No production helper is instrumented or changed for the test.

The13-line SQL correction keeps pure shape/UUID/duplicate validation and canonicalization early, then acquires the existing connection lock **before** locked membership/workspace validation. Current membership, storage version and requested capability are still rechecked under SHARE locks before any immutable selection comparison or grant persistence. Connection UPDATE precedes workspace SHARE, consistent with the established connection authority lock preceding the command's workspace mutex. Immutable selections, attempt UUIDs, exact pending cleanup, current Auth checks, revocation checks and helper privileges are unchanged.

### RED

```
node --test supabase/tests/oauth-concurrency.mjs
1 test / 0 pass / 1 fail
ERROR: 40P01: deadlock detected
while locking tuple in integration_connections
PL/pgSQL function public.prepare_integration_consent(text,jsonb) line25
```

`/tmp/task3-round2-red.log` contains the actual independent-session failure. This was generated against the previous source before changing production SQL.

### GREEN

```
node --test supabase/tests/oauth-concurrency.mjs
1 test / 1 pass / 0 fail
node --test tests/oauth-grants.test.js
9 tests / 9 pass / 0 fail
TEST_MCP_URL=http://127.0.0.1:61921/functions/v1/mcp \
  node /tmp/task3-run-deno.mjs --unstable-no-legacy-abort supabase/functions/tests/oauth.test.ts
1 pass / 0 fail (real local PKCE, refresh and all12 MCP tools on Edge)
npx eslint supabase/tests/oauth-concurrency.mjs
PASS
npx prettier --check supabase/tests/oauth-concurrency.mjs
PASS
git diff --check
PASS
```

Logs: `/tmp/task3-round2-concurrency-final.log`, `/tmp/task3-round2-grants.log`, `/tmp/task3-round2-pkce.log`.

The concurrent test requires both transactions to fulfill without40P01. It verifies exactly one authorized domain write committed before reconsent; the resulting new connection attempt is pending and does not authorize the old OAuth token; explicit Auth approval activates read access; that read grant permits reads and denies writes; Auth consent revocation then denies reads. SQL fixtures use synthetic Auth rows/JWT settings solely for database concurrency/permissions; they are **not** described as OAuth exchanges. The separate actual Edge PKCE test supplies the real OAuth evidence. Session statement waits are bounded at5seconds, barrier waits8seconds and testcase timeout40seconds. Only its own disposable container is removed.

Affected grant/concurrency/real PKCE checks were rerun. UI/protocol/TypeScript source is unchanged in this correction; the prior scoped browser6/6, typecheck, build and full Node evidence remain in round1 rather than being rerun without a new frontend concern.

### Local application / stop condition

Controller allowed a local additive function refresh. `/tmp/task3-round2-local-functions.sql` atomically replaces **only** `prepare_integration_consent`, preserving its existing grants/signature; it was applied to the dedicated review stack and PostgREST schema reloaded. No table reset, column change, credentials change, remote mutation or unrelated container action. The local stack now matches the final function in migration003. Source is frozen at the correction commit for scoped independent rereview.

Primary documentation: PostgreSQL17 lock consistency/deadlock guidance
https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-DEADLOCKS and the blocking-session observation function
https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-SESSION-TABLE .
