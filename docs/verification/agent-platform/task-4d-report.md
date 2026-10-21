# Task 4d implementation report

Status: DONE (implementation scope). Independent review, frozen local/hosted rollout and actual HTTPS API/MCP proof remain the root's next gate. Task 6c remains paused. No push, merge, remote migration/deploy, shared local Supabase reset/stop, browser activity, or subagent work was performed.

Worktree: `/Users/hdoria/projects/task-manager/.worktrees/agent-platform`.
Branch: `feat/agent-platform`.
Base: `a003627048c790e258443b347c0edc988a28b960`.
Owned commit: `c7694842f35fa483ffd20a6f13d00b2d3d130dd2` (`feat(api): guard team membership baselines atomically`).
Migration: `supabase/migrations/202610200008_team_membership_baselines.sql`.
SHA-256: `2b6b58df4b35e0236a992d5b304efa4041f40a085a340b7b34753cac5f1f0a39`.
This ignored operational report is outside the source commit. Root's dirty plan/spec were neither staged nor edited.

## Owned files

1. `src/domain/contracts.ts`: `TeamMembershipBaseline` type.
2. `src/workspace/local-command-rules.js`: optional field on create/update team only.
3. `src/workspace/local-panel.js`: shared strict shape validation; `// @ts-check` remains the first line.
4. `src/workspace/local-mutations/panel.js`: current graph relationship comparison and strip guard before patch. Existing reset code untouched.
5. `supabase/functions/_shared/team-memberships.ts`: pure reusable shape/ID/set validator.
6. `supabase/functions/_shared/validation.ts`: API field allowlist and cloud UUID validation seam.
7. `supabase/functions/api/openapi.json`: optional guard schema, set/error/replay/limit semantics; existing batch references automatically include it.
8. `supabase/functions/tests/team-membership-baselines.test.ts`: shared validator tests.
9. `supabase/migrations/202610200008_team_membership_baselines.sql`: additive validation/graph wrappers and workspace/user/team index.
10. `supabase/tests/team-membership-baselines-postgres.sh`: disposable PostgreSQL 17 test harness, same-backend warm migration and independent competing sessions.
11. `supabase/tests/team-membership-baselines.sql`: SQL transaction/security/replay/ACL contract assertions.
12. `tests/team-membership-baselines.test.mjs`: actual local adapter, PGlite SQL and OpenAPI contract tests.

## Interface and implementation

`create_team` and `update_team` accept `expectedMemberships?: Array<{ userId: string; teamIds: string[] }>` inside input. Omission preserves published behavior. The supplied subset of users is checked against their exact current set; it is not global uniqueness. Empty guard list is valid; `teamIds: []` means no relationship. Order does not matter. Duplicate users/team IDs and unknown nested properties are validation errors. Cloud users must be UUIDs (duplicate detection ignores UUID letter case); local IDs preserve existing historical text identities. Team IDs preserve exact spelling and punctuation, allow numeric strings and Unicode, use the existing 006 UTF-16/ECMAScript trim contract, and reject numbers/NUL/lone surrogates.

The existing engine authorizes the current actor, validates, locks the workspace, and returns an authorized receipt before reaching the new graph wrapper. Under that existing mutex the wrapper checks current workspace membership and set equality before changing the command's target. It removes the guard before invoking the old graph implementation. Missing current user membership or vanished/foreign/different team relationships return `version_conflict` (409), not a shape error. It never consults another tenant or creates Auth identities. All wrappers stay private INVOKER functions with PUBLIC/anon/authenticated execute revoked. `team_members_by_user(workspace_id,user_id,team_id)` supports the comparison. No engine/OAuth/fanout/policy changes and no changes to migrations 001–007.

The local adapter checks `member.team`, restricted to pure `localTeams(data)` projection, on the current transactional graph. Missing teams versus explicit empty teams retain existing semantics. Failed commands preserve storage bytes/revision and unknown metadata. Guard is removed before `patchLocal`; it is never stored as entity metadata. Replay returns its existing result without re-executing the guard. Local demonstration auth semantics remain unchanged: existing team operations do not introduce a new Guest/current-membership enforcement layer. Actual authority/Guest/revocation assertions are SQL tests.

Root clarified there is no generic/team MCP command surface. All 12 existing tools remain unchanged; no new tool was added. Shared API schema and OpenAPI carry the optional input. Actual MCP rollout/discovery is for the root gate.

The helper was located in `supabase/functions/_shared` after read-only `docker inspect` proved the running Edge container mounts that directory and only `src/domain/contracts.ts` from domain. Local imports the pure helper; it has no Deno.env, server imports or secrets. No Docker/config change was needed. Deno entrypoint checks and both Vite builds pass; actual Edge HTTP runtime is not claimed before root's reviewed deployment.

Limits remain 100 batch commands and 262144 input limit; existing rate accounting is unchanged. No chunking, unbounded aggregate operation or artificial updates of other teams. Guard evaluation applies immediately before each guarded create/update, so the UI planner must attach the guard to its first team create/update before relationship edits. The planner adoption is deliberately deferred to resumed Task 6c.

## RED to GREEN and evidence

All paths below are local logs under `/tmp`, with no credentials printed.

- Before product changes, `node --test tests/team-membership-baselines.test.mjs` failed 8/8 on actual local/SQL old implementations because `expectedMemberships` was rejected. `/tmp/task4d-red-node.log`. The tests describe serialized disjoint A/B plans, rollback, phantom/team/member drift and shape semantics; unguarded SQL compatibility later verifies existing multiple relations explicitly.
- Before product changes, `deno test --config supabase/functions/deno.json supabase/functions/tests/team-membership-baselines.test.ts` failed 1/1 (`validation_error` for the new valid input). `/tmp/task4d-red-deno.log`.
- First implementation run passed 7/8. The eighth test incorrectly expected new local Guest enforcement; source inspection established that existing team operations do not have it. Root confirmed preserving that existing contract. The test now verifies existing device replay instead. No product auth change was added. `/tmp/task4d-green-node-first.log`.
- A new sparse-array case failed shared validation (`Missing expected exception`), `/tmp/task4d-red-sparse.log`. A direct Node probe showed sparse `.every` skips holes; the pure validator now densifies both arrays for validation. Final Deno passes this case.
- Final behavior suite after moving the helper: `node --test tests/team-membership-baselines.test.mjs tests/local-panel-types.test.mjs` passed **13/13** (10 behavior/SQL cases + 3 actual-source compiler guard tests). `/tmp/task4d-final-node.log`.
- Full `npm test` passed **199**, failed **0**, skipped **1** (existing real Supabase Auth/PostgREST test requires explicit integration configuration), 200 total. `/tmp/task4d-all-node.log`. This full run preceded the helper-only path relocation and final OpenAPI doc test. Final focused tests, static checks and builds cover the relocated source; no claim of a later whole-suite run.
- Earlier route/source regression run passed **22/22**: `node --test tests/team-membership-baselines.test.mjs tests/remaining-routes.test.mjs tests/local-panel-types.test.mjs`, `/tmp/task4d-focused.log`.
- Final Deno command: `deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/tests/team-membership-baselines.test.ts supabase/functions/tests/operations.test.ts supabase/functions/tests/api.test.ts supabase/functions/tests/mcp.test.ts` passed **13/13**, `/tmp/task4d-final-deno.log`.
- `bash supabase/tests/team-membership-baselines-postgres.sh` passed on disposable **PostgreSQL 17**. `/tmp/task4d-postgres-final.log`, `/tmp/task4d-postgres-first.log`, `/tmp/task4d-postgres-second.log`. The script removes only its own randomly named container. The shared 61921/61922 services were not altered by this runner.
- That real PostgreSQL runner loads actual 001, 002, 003, 005, 006, 007 and then 008. Same backend warms standalone and batch 007 validation/graph plans before loading 008. It tests stale empty baseline and a prior-child rollback (teams/joins/events/receipts/rate records), replay, unguarded multi-team behavior, unordered sets, newly created-team phantom, missing user, foreign expected team, malformed values, case-insensitive UUID duplicates, whole oversized requests, no guard metadata, untouched team versions, unknown metadata, private ACLs and denied direct helper calls, Guest/tenant denial, real OAuth grant agent execution/replay, grant downgrade and membership revocation. Two independent backends then contend: first guarded A commits, second guarded B receives `version_conflict`; B and its preceding create/event/receipt remain absent. Fixture Auth tables are synthetic; no real external identity is fabricated. 004 webhook integration is not part of this focused harness; the full Node suite independently passed its existing real pgmq/Vault/Cron coverage, and actual whole-stack API proof belongs to the root gate.
- Exact accepted/rejected ID fixture tests cover punctuation, whitespace edge cases, 128 UTF-16 units, astral Unicode, numeric strings versus numbers, stale deleted team/current member and an accepted atomic **100-child** guarded batch. **101** and oversized whole requests reject with no partial state.
- OpenAPI doc test initially failed for absent optional schema, `/tmp/task4d-red-openapi.log`; after doc update, `node --test --test-name-pattern='OpenAPI exposes' tests/team-membership-baselines.test.mjs` passed **1/1**, `/tmp/task4d-green-openapi.log`. Only 31 lines added to OpenAPI, no existing contracts rewritten.

## Static/build verification

- `npm run typecheck`: pass, `/tmp/task4d-final-typecheck.log`.
- `npm run lint`: pass, `/tmp/task4d-final-lint.log`; scoped lint repeated after adding OpenAPI test, `/tmp/task4d-scoped-lint.log`.
- Prettier check on all changed source/test JS/TS: pass, `/tmp/task4d-final-format.log`; final JSON/Node test check pass, `/tmp/task4d-doc-format-check.log`.
- `deno fmt --check --config supabase/functions/deno.json supabase/functions/tests/team-membership-baselines.test.ts`: pass, `/tmp/task4d-final-deno-format.log`.
- `deno check --config supabase/functions/deno.json supabase/functions/api/index.ts supabase/functions/mcp/index.ts`: pass, `/tmp/task4d-final-deno-check.log`.
- `node /tmp/task4d-build.mjs`: configured cloud and cleared-local `npm run build -- --outDir <temporary-directory> --emptyOutDir` both exit **0**. `/tmp/task4d-build.log`, `/tmp/task4d-build-cloud.log`, `/tmp/task4d-build-local.log`, `/tmp/task4d-build-scan.json`. Build directories `/tmp/task4d-cloud-QdVbJl` and `/tmp/task4d-local-ETT7ST`. Two private candidate values were checked against generated text artifacts: **0 literal matches**; `.env.local` hash unchanged. This is a limited literal scan, not a general security audit. Existing >500 kB bundle warnings remain; no threshold change.
- `git diff --check`: pass. First line of local-panel.js verified as `// @ts-check`. Only root's previously dirty plan/spec remain in `git status --short` after the owned commit.

## Boundaries and stop condition

No public arbitrary metadata API, new MCP tool, UI planner edit, unrelated I1 reset fix or other 6c finding was included. No performance percentile or test-coverage percentage is claimed. No browser behavior or hosted runtime proof is claimed. The regression suite validates the new narrow guard and preserves preexisting semantics; it does not certify the whole branch.

Stop condition reached: owned implementation committed, evidence and exact migration hash recorded, ready for independent source review. Root should freeze this commit, review/apply 008 and redeploy the affected Edge runtime, run actual local/hosted API/MCP proof, and only then resume 6c planner/finding fixes.
