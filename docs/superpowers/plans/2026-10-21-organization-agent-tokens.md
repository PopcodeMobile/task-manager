# Organization Agent Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let human organization admins issue revocable, organization-scoped tokens for headless agents to use the existing MCP/API task tools.

**Architecture:** Private hashed credentials attach to a stable organization connection and agent. Narrow public-key RPC entrypoints validate the credential on every transaction and reuse domain authorization/CAS/idempotency under a trusted token context. Existing human/OAuth authentication stays intact; React exposes management only to current human owner/admin members.

**Tech Stack:** Existing React/TypeScript/shadcn, Supabase PostgreSQL/Auth/Edge, MCP SDK, Node/PGlite and Playwright; no dependency migration.

**Spec:** `docs/superpowers/specs/2026-10-21-organization-agent-tokens-design.md` (approved; execute without another approval loop).

## Global constraints

- Keep migrations001–010 byte-identical; additive `202610210011_organization_agent_tokens.sql` only. No fake human membership, user JWT minting or service-role domain bypass.
- Token secret256bits, format `krs_<32 lowercase hex selector>_<43 base64url secret>`; display/store full token only on issuance response. Store hash and public selector privately.
- Only direct human owner/admin can manage. Each token belongs to one organization. Read/write permit exactly the current12MCP tools, not general administration.
- Expiry choices30/90/365days or null (explicit never); default90. Bound/validate name1–100trimmed characters. Server clock controls validity.
- Rotation preserves connection, agent and idempotency identity, revokes the previous credential atomically. Current authority must precede cached receipt replay.
- No secrets in logs, URLs, local/session storage, telemetry, events or reports. Response/error data is safe. Keep original Task7/Cron/main integration gates open; do not configure real Hermes profiles in this feature.
- Use isolated existing worktree `feat/agent-platform`; retain unrelated work. Hosted migration/function/frontend publication is authorized by the accepted design and "pode seguir". Only disposable fixtures, private backups, matched frozen artifacts.

## Shared interfaces

`AgentTokenConnection` metadata (camelCase): `{ id:string, workspaceId:string, agentId:string, name:string, capability:'read'|'write', prefix:string, createdByUserId:string|null, createdAt:string, expiresAt:string|null, lastUsedAt:string|null, revokedAt:string|null, status:'active'|'expired'|'revoked' }`.

RPC contracts (SQL parameter names are stable across workers):

- `create_organization_agent_token(p_workspace_id uuid,p_name text,p_capability text,p_expires_in_days integer default90)` → `{token:string,connection:AgentTokenConnection}`. SQLnull means explicit no expiry.
- `list_organization_agent_tokens(p_workspace_id uuid,p_limit integer default50,p_cursor text defaultnull)` → `{items:AgentTokenConnection[],nextCursor:string|null}`. Stable createdAt/id cursor bound to workspace, max100; UI follows pages explicitly.
- `rotate_organization_agent_token(p_workspace_id uuid,p_connection_id uuid,p_expires_in_days integer default90)` → same issuance result; expired may rotate, revoked connection cannot be revived.
- `revoke_organization_agent_token(p_workspace_id uuid,p_connection_id uuid)` → `{connection:AgentTokenConnection}`; repeated revoke safe.
- `authenticate_organization_agent_token(p_token text)` → `{kind:'organization_token',principalId:string,connectionId:string,agentId:string,workspaceId:string,capability:'read'|'write',userId:null,clientId:null}`. No reusable authenticated session; every later RPC validates secret again.
- `read_organization_agent_operation(p_token text,p_workspace_id uuid,p_operation text,p_query jsonb default'{}')` → same normalized query envelope. list_workspaces accepts null workspace and returns only credential organization.
- `execute_organization_agent_operation(p_token text,p_workspace_id uuid,p_operation text,p_command jsonb,p_idempotency_key text,p_expected_version bigint defaultnull)` → existing command result.

Token RPCs use project public apikey, never forward the opaque token as PostgREST JWT; raw credential is a private RPC argument. Existing JWT requests retain their original Authorization header. Actor discriminates organization tokens; ordinary Actor constructors remain source-compatible. Resolve full token only in private WeakMap, not public Actor. REST transport must reject unsupported operations identically to SQL.

Comment DTO adds optional `authorAgentId:string|null`; token comments have null authorUserId and their agent ID. Agent projection may add optional connectionSource; OAuth remains unchanged. Backend owns accurate attribution and stable technical principal namespace without overloading human membership.

## Review focus

- Credential/connection/workspace/session changes while requests are in flight: do not show old secrets, restore old state, or authorize replay after revocation.
- Direct RPC/GUC/claims spoofing and private helper calls: raw valid secret must be required; arbitrary context or caller-provided principal cannot gain authority.
- Read token and another workspace on same project ref: reads/writes cannot widen beyond the original organization or current capability.
- Rotation during a live claim or identical retried create: same executor/namespace, one effect, no old credential use or active-reservation bypass.
- Token agent comments/events versus human authorship: never credit the creator; existing OAuth/human rendering and retention remain valid.

---

### Task1: SQL authority, credentials, lifecycle and audited domain operations

**Ownership:** backend worker owns new migration, `tests/organization-agent-tokens.test.mjs`, new concurrency SQL harness if needed, and narrowly scoped auditor/test changes. No Edge/UI edits, hosted mutations or commits.

**Consumes:** approved spec and shared interfaces. **Produces:** seven RPCs above, trusted principal context, accurate comment/event/agent projections and negative API-boundary coverage.

- [x] Write failing real SQL tests against001–010 for missing admin issuance/token execution; run and capture intended feature failure.
- [x] Add private connection/credential storage, SHA256 verifier, admin management, bounded metadata cursor, no-store issuance and immutable lifecycle audit. Validate expiry/name/capability and deny direct credential reads/GraphQL.
- [x] Add narrow token read/command RPCs and private per-transaction context; authority before mutation/replay, claim/version/rate fencing, stable rotation namespace. Preserve all old semantics and comments authorUserId null+authorAgentId for tokens.
- [x] Add realistic role and concurrent-session coverage for spoofed context, outsider/cross-org, revoked/expired/rotated, read writes, management through OAuth/agent, replay, admin loss, creator deletion and claim lifecycle.
- [x] Extend catalog auditor only for exact new reviewed helpers; preserve recursion/sensitive-schema/dynamic-SQL protections. Verify focused positive and negative cases.
- [x] Run focused SQL/auditor tests and existing affected execution/OAuth/branding regressions. Expected: zero failures, migration001–010 unchanged. Report hashes and safe test evidence for independent review.

### Task2: Edge auth, operation routing and MCP/API compatibility

**Ownership:** transport worker owns `_shared/auth.ts`, `_shared/operations.ts`, `mcp/index.ts`, new token Edge helpers/tests, OpenAPI; `src/domain/contracts.ts` Actor/Comment and normalized type changes only. Do not edit SQL, UI, existing OAuth logic unnecessarily or deploy/commit.

**Consumes:** shared SQL interfaces above. **Produces:** opaque-token auth path, database calls carrying private credential, same12tools and REST allowlist, unchanged JWT OAuth path.

- [x] Add failing tests for valid opaque credentials, malformed/unknown/revoked responses, resolver safe errors, token read/write routing and restrictions before current implementation.
- [x] Implement narrow verifier before existing JWT wrapper, discriminate token Actor, retain private credential and revalidate on every query/command (including MCP initialize/tools list). Respect original JWT signature/issuer/user checks.
- [x] Route public-apikey SQL calls to token entrypoints; raw secret never becomes a JWT or body-provided Actor. Reject REST administration/create_workspace, forbid arbitrary operations; shared DB also enforces allowlist.
- [x] Update OpenAPI security description and examples using placeholders only; keep tool names and existing client compatibility.
- [x] Run Deno tests/type check and affected existing auth/API/MCP tests. Expected: all passing, unknown errors safe, no OAuth regression. Report exact source hash/proof.

### Task3: Human-admin management UI and agent attribution (root)

**Files:** create `src/app/agents/AgentTokensPanel.tsx`, `src/app/agents/agent-tokens.ts`; modify IntegrationsPanel, PermissionMatrix, scoped panel.css, relevant existing comment renderer only if needed; add focused browser configuration/tests.

**Consumes:** management metadata/RPC contracts and current repo/admin/session boundary. **Produces:** generate/list/load-more/rotate/revoke/copy flows in current organization.

- [x] Write failing browser fixtures for owner/admin issue, one-time secret, member/guest/no-cloud denial, failure and cross-organization/session race boundaries.
- [x] Implement small typed metadata/issue RPC module and component. Fixed organization; read default;90day default with explicit none; clear secrets/drafts on close/session/workspace/authority changes; suppress late results. Do not use persistent browser storage.
- [x] Add AlertDialog for rotate/revoke, expiry/last-use/status metadata, manual Copy result/error and safe endpoint/config help. Follow pages without hiding earlier active credentials. Validate before submit; errors retain nonsecret inputs.
- [x] Integrate panel/matrix and ensure token-authored comments/events show real agent identity. Keep existing layout/tokens/PT+EN/mobile behaviors.
- [x] Run focused browser/type/lint/token checks. Expected: valid flows and no secret appearing in storage/URL/errors; mobile layouts fit, no auth-user misattribution.

### Task4: Independent review and combined verification

- [x] Dispatch clean-context security reviewer for SQL/Edge/auth/inventory, and UI reviewer for compiled flows/attribution; implementation authors do not approve themselves.
- [x] Fix supported blocking findings within file ownership, with failing regression first; get scoped independent re-review of changes.
- [x] Run full Node suite, Deno affected transport suite, lint/types/format/tokens and allowlisted production build. Separate skips from passes and store safe summaries. Expected: zero failures and prior migrations unchanged.

### Task5: Hosted activation, disposable live MCP proof and frontend publication

- [x] Freeze exact reviewed backend source; take private0600 public schema/data backups; dry-run only011, no seeds/roles/Vault/Auth/Cron changes.
- [x] Apply011 to dedicated project, deploy matched API/MCP only, inspect live catalog/ACL/data exposure through updated auditor.
- [x] Provision only synthetic fixture owner/admin/member/outsider and workspace/project. Use real human JWT for admin issuance; prove token MCP initialize/tools/list/read/create/comment/claim/replay/rotation/revocation, read-only/cross-org/admin denial and fresh requests after invalidation. Cleanup recorded IDs only and verify residual counts zero. Never log secrets or real user records.
- [x] Freeze and publish static Vercel artifact from allowlisted source with public URL/key only; compare production hashes and finite isolated public smoke. Do not configure real Hermes/webhooks or enable Cron.

### Task6: Receipt, commit and stop

- [x] Record validation, limits, token/VPS instructions with placeholders, and ready-to-send team message in Hugo's voice; scan new artifacts for real secrets and voice constraints.
- [x] Commit conventionally on isolated feature branch after checks; verify committed sources match deployed manifests and working tree clean. Keep original Task7 main/push integration gate intact.
- [x] Stop when admin can issue through public panel, the token can read/create only its organization via real MCP/API, invalidated credentials fail and all fixture cleanup/review evidence is recorded.

## Delivery record

Tasks 1–5 passed with independent review and hosted/public verification. Task 6 receipt and local commit checks are recorded in [delivery verification](../../verification/agent-platform/organization-agent-tokens-2026-10-21.md). Original Task7 main integration and real Hermes/Claude gates remain open.
