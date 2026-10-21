# Final local visibility correction N3

2026-10-21. N3 implemented with focused proof; **independent exact-diff verification pending**. N1/N2 remain addressed according to the preserved [independent residual review](final-residual-review.md). No broad review restart, deployment or approval downgrade.

- BASE: `2c555e4852ebe4cbaf98e7a7991edbe0a383720d`.
- Product HEAD: `6976360e94ece2407dffc926eb1c7654449e8fef`. Delivery HEAD is the documentation commit containing this report, supplied in the completion handoff.
- Branch/worktree: `feat/agent-platform`, `/Users/hdoria/projects/task-manager/.worktrees/agent-platform`.
- Root's nineteenth and twentieth [rulings](final-rulings-source.md) are appended verbatim. The review is preserved byte-identically as raw.txt, with a formatter-normalized Markdown view and provenance link.

## Change and scope

Only `ContextHistory.tsx` production code changed: a local-only guard classifies the eight supported project operations (create/update/delete/archive/restore, set/remove project member, local project sharing). It checks the visible project set against payload.projectId when available, otherwise entityId. This closes the exact local producer shape `update_project`, entityId=private-project, payload={}. The member feed no longer passes that hidden project's actor/action/timestamp to ActivityPage.

Visible project events remain. Legitimate unscoped workspace/member events are not project operations and remain. Cloud scope, current pagination, data fetching, mutation authorization and lease projection are unchanged. This is local-demo visibility parity, not a claimed cloud tenant/Auth vulnerability fix. No hidden project name/body/link was exposed in the reviewed trigger.

`tests/residual-history.test.mjs` adds precisely the three requested controls through the actual ContextHistory + actual usePagedCollection JSX/state/effect fixture: hidden project suppressed, visible project retained, and `local_workspace_member` with no project association retained. The existing contextual paging/failure/retry/polled-event test also runs unchanged.

## Evidence

| Command                                                                                                          | Result                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test --test-name-pattern='local history visibility' tests/residual-history.test.mjs` before product edit | 2pass/1fail; hidden project incorrectly rendered. [red.log](final-visibility-evidence/red.log).                                             |
| `node --test tests/residual-history.test.mjs` on final source                                                    | 4pass/0fail/0skip. [green-final.log](final-visibility-evidence/green-final.log). Three visibility controls plus existing paging regression. |
| `npm run typecheck`                                                                                              | Passed. [types.log](final-visibility-evidence/types.log).                                                                                   |
| `npx eslint src/app/activity/ContextHistory.tsx tests/residual-history.test.mjs`                                 | Exit0; empty [lint.log](final-visibility-evidence/lint.log) output.                                                                         |
| `npx prettier --check src/app/activity/ContextHistory.tsx tests/residual-history.test.mjs`                       | Passed. [format-check.log](final-visibility-evidence/format-check.log).                                                                     |

These are direct production-component evaluations with injected hooks/repository; no new browser, build, SQL/race/full-suite run is claimed or needed for this boolean filter. Earlier preview/build/SDK evidence remains tied to its original source. Root owns a later final-source preview build and actual runtime gate. No test server or freeze was requested; existing5182/5173/5174 services were untouched. Log copies strip trailing whitespace/extra EOF blank lines only. No credentials or browser traces were read/copied.

Owned documentation formatting also passed ([docs-format-check.log](final-visibility-evidence/docs-format-check.log)); review raw bytes/rulings19–20 verified and bounded scan checked14files with0matches ([archive-check.log](final-visibility-evidence/archive-check.log)). No universal secret/security claim.

Migration009 remains byte-unchanged at SHA-256 `f2212f8031061ad9d12cd76e491cf9f53ba2fb064131131c9f7fc3a644f47fb3`. During this handoff, root reported approving the backend-only gate at frozen2c555e4 and applying009 successfully to local61922; hosted schema/API/MCP remained008 at that update, with Cron disabled. This implementer did not apply or deploy anything. Root owns subsequent actual-runtime evidence; later root reports supersede this timestamped handoff state. The reported private0600nonempty hosted schema/data backups are not a full Auth restore proof. This correction does not apply009, publish a frontend, enable Cron, activate real Hermes/Claude or satisfy the retention/receiver/Auth/CORS gates.

Stop condition: minimal N3 filter, three controls, narrow checks, preserved review/ruling and clean local commits delivered. Root's same reviewer checks only the N3 diff/tests next. No subagent, push, merge, external change or unrelated product edit.
