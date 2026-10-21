# Verification

Current source and backend gates: **approved**, through migration009. [Actual runtime009 proof](verification/agent-platform/runtime-009-proof.md) records real local/hosted Auth/API/MCP,285/285tests with0skips, including45auditor cases and actual local SDK tests,51object catalog checks, final artifacts and cleanup. Lint, types, global formatting, tokens234/103 and build also pass in the final whole-tree check.

Public frontend, actual Hermes/two personal-Claude users, production Auth/CORS, DNS/TLS/receiver/effective retention and Cron activation remain pending. No push/main integration or full-project completion is implied. The [evidence archive](verification/agent-platform/README.md) preserves earlier source hashes, failures and review chronology.

The following table preserves the earlier Task6d evidence and its boundaries; it is not relabeled as a fresh final-fix aggregate.

| Gate                         | Evidence and limit                                                                                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregate check              | Explicit lint, frontend typecheck, formatting, Node/domain/SQL tests, token guard and production build. Cutover source: 212/212 tests, 0 failures/skips; all aggregate stages passed. Later tooling-only fix round 2 passes 24/24 auditor tests, full source audit and lint; no new aggregate is claimed. |
| Current normalized lifecycle | Actual local Auth/PostgREST SDK joins, tenant isolation, guest/role metadata denial, CAS, metadata, login/logout; fresh unique private fixtures and cleanup.                                                                                                                                              |
| Old workspace cutover        | Separate migration/writer-denial test preserves original snapshot/revision and proves repeated migration cannot overwrite later normalized writes.                                                                                                                                                        |
| Browser local                | Final entry with21namedroutes+404,8tabs/savedviews, PT/EN, persistence, dirty recovery, native drag, files, projects, settings and token effects. 67/67 latest outcomes across complete/focused dev runs; 7/7 preview. The report identifies earlier failures and their reruns.                           |
| Browser cloud                | RPC fixtures are labeled separately from actual local Auth/DB/MCP tests. 25/25 latest dev outcomes and 3/3 preview; claims, CAS, >100cursor reads and team conflicts retain original quotas/fixtures.                                                                                                     |
| OAuth and serve modes        | Actual local consent/grants/revocation: 6/6 dev and 6/6 preview, plus direct callback/consent/deep-link query reload. Vercel configuration matches; no published-host browser proof.                                                                                                                      |
| Deno                         | Supported source/test check;28live tests plus separately run TLS fixture. One transport case is ignored in the general run and explicitly covered by the focused TLS command. Expanded original-path Edge fixture check failed; real Edge runtime is a separate proof.                                    |
| Real PostgreSQL              | Restricted migration/RLS/CAS/claims/idempotency/concurrency and008team baselines passed on disposable PostgreSQL. Shared local stack was not reset.                                                                                                                                                       |
| Tokens and builds            | 234publictokens; CSS and TS/TSX/cn/cva authoring checks, cloud and cleared-cloud builds, vendor chunks below the prior warning threshold, private-literal scan. Shared JS is not universally typechecked.                                                                                                 |
| Backend format               | 15approvedfiles parse without diagnostics and preserve normalized AST operators/literals/child structure relative to BASE.                                                                                                                                                                                |

## Evidence boundaries

The [hosted preactivation record](verification/agent-platform/hosted-preactivation-proof.md) contains actual dedicated hosted API and MCP/OAuth proof through008, including12tools, PKCE/refresh/revocation and two synthetic principals. It is distinct from frontend cloud-mode browser tests against local real Auth/DB. It is not two actual Claude accounts. The worker and empty-queue Cron wake-up were verified; Cron remains disabled pending receiver activation.

The [pinned isolated Hermes record](verification/agent-platform/task-7-hermes-isolated-runtime.md) passed5/5 admission/HMAC/concurrency/restart cases with a synthetic provider and isolated home. It does not prove actual production Hermes acceptance or side-effect idempotency. DNS/TLS, frontend publication, production Auth/CORS URLs and two actual Claude-user connections remain Task7/root gates. Browser URL policy blocked the earlier Vercel publication attempt; no alternate-surface workaround or deployment is claimed.

The [read-only Hermes retention preflight](verification/agent-platform/task-7-hermes-retention-preflight.md) establishes main-file/default auto_prune=false, not effective runtime settings. Maximum programmed Retry-After waits alone total604800seconds; queue/outage/manual replay add to that horizon, so fixed7days is not proven safe.

No coverage percentage or blanket security certification is implied. File actions store metadata; cloud invitations, project privacy, byte uploads, billing/session/2FA demos remain explicitly unavailable. Full workspace backups and arbitrary nested drafts are not promised by the task-draft export.

## Reproduce

Use Node22+, Docker, Playwright Chromium and the dedicated local Supabase stack. Public frontend variables configure Auth. Private test status/keys stay outside Git. See [Supabase setup](supabase-setup.md) and [Hermes setup](hermes-integration.md).

```sh
npm run check
npm run typecheck
npm run test:e2e
npm run test:agent:ui
npm run test:oauth:ui
bash supabase/tests/run-postgres.sh all
bash supabase/tests/team-membership-baselines-postgres.sh
```

The default browser run clears cloud variables and owns strict5180; cloud owns strict5181; OAuth owns strict5180. Run sequentially with sources/builds frozen and no existing listener reuse. Live cloud/OAuth tests require private TEST_SUPABASE_* variables; missing credentials are skips, not integration proof. SUPABASE_TEST_CONFIG enables real SDK fixtures. Exact Deno, TLS and Edge commands/output paths are in the report.

## Historical baseline: 2026-10-16

The independent legacy review passed its then-current check,33SDK/unit/SQL tests,9local and2cloud browser flows, real PostgreSQL and234tokens/92sources. It reproduced stored-name markup, delayed logout, drag isolation, auth-language and Portuguese-name fixes. Those results refer to the pre-React source and do not replace the current normalized/React proof. At that time remote migration/deployment were pending; the later hosted record supersedes that status for the dedicated backend only.
