# Task 6b0 report

Base: `b08bd69c56c15b2947ff6dbe6362a8fc2d736ee1`. Scope was explicitly narrowed by root from aggregate6b to structural prerequisites only, using `task-6b0-brief.md`. No new commands, routes or product behavior. No subagents. Stop condition: scoped commit, exact evidence and interfaces ready for independent root gate; the remaining6b1–6b4 inventory stays mandatory.

## Implementation and consumer contract

`createLocalWorkspaceRepository` in `src/workspace/local-panel-repository.ts` is now the shell's local `RepositoryFactory` implementation. Its options require the existing persistence repository, getItem/setItem storage, a string-or-null workspace ID and optional device identity. It returns an explicitly checked `WorkspaceRepository` object; App no longer coerces the whole adapter through `unknown`. The local mode and workspace owner role use narrow const JSDoc literals instead of widening to arbitrary strings.

The typed factory checks method availability, public signatures and the returned object/envelope structure. Generic operation payloads still use narrow assertions at query/list/rpc/command return boundaries, just as the cloud repository does. This is not a claim that TypeScript validates every operation-specific legacy JSON payload: runtime validation remains in the existing local command validator, projections remain in local-dto.js, and the graph remains JavaScript. The command assertion is confined to `result.data`; eventId/requestId remain the checked CommandResult envelope. No declaration file or whole-object cast hides missing methods.

The `controller` property remains a getter over the underlying adapter, so dispose/activate and captured-controller fences retain their semantics. The wrapper introduces no cache, transaction, revision or second persistence path. Local list/query always read persistence as before; the optional cloud cache-fresh flag has no local cache to invalidate. Personal/preferences and workspace methods retain their existing identity/workspace namespaces. All32 local tests now enter through this same typed factory used by App, including lifecycle/reactivation and concurrent migration scenarios.

The local dispatcher remains in `local-panel.js`. It validates the allowlisted input before explicitly dispatching to five cohesive modules under `local-mutations/`: tasks, projects, comments, subtasks and dependencies. Each receives the existing transaction-local context (graph plus find/CAS/bump/DTO/version-initialization/key helpers) and returns its prior result. `task-graph.js` shares the unchanged task-copy and protected-removal helpers between task/project handlers. There is no registry/framework and no handler performs persistence, retries or event emission.

## Preserved invariants

The single existing persistence.transact closure, synchronous read/change/write, original graph `_panel` restoration, top-level reactPanels/creationRequests bookkeeping, command signatures, receipts, batch ordering/100-child bound, event emission, revision advancement, conservative old-writer drift and generated entity version initialization are unchanged. The handlers retain effective-field completion/recurrence, surviving dependency/file deletion protection, project-internal deletion, copy semantics and unknown metadata preservation. No storage envelopes, keys, text IDs or DTO fields changed. No cloud repository, Auth/sessionBoundary, DraftGuard, CAS/retry or polling implementation changed.

An AST-printer self-review compared the extracted code against the base: all7 original mutation branch statements and both graph helper bodies are identical after formatting. Evidence: `/tmp/task6b0-structure-proof.log`; reproducible checker: `/tmp/task6b0-review-structure.mjs`. This is a supplementary equivalence check, not a substitute for the runtime/browser suites.

## RED and focused GREEN

- Removed App's whole-adapter double cast before implementation. `npm run typecheck` failed with TS2345: local adapter mode inferred as string is incompatible with the RepositoryFactory return contract. Exact diagnostic: `/tmp/task6b-boundary-red.log`.
- Existing adapter baseline before extraction: `node --test tests/local-panel-repository.test.mjs` ->32/32 passed,0 failures (`/tmp/task6b0-local-baseline.log`). The structural refactor adds no new runtime behavior and uses the existing behavior regressions; no synthetic failing behavior test is claimed.
- After extracting handlers, the same32/32 passed (`/tmp/task6b0-extraction-green.log`). After routing them through the typed shell boundary,32/32 passed again (`/tmp/task6b0-boundary-unit.log`). Typecheck then passed (`/tmp/task6b0-boundary-green.log`).
- In-memory compiler mutation experiments (no worktree edits) removed dispose and replaced eventId with a number in the new factory. Both were rejected by TypeScript with the expected missing-property/type errors. Exact diagnostics are in `/tmp/task6b0-structure-proof.log`. This verifies that the factory checks the public structure rather than merely changing cast spelling.

## Final source verification

All commands ran from `/Users/hdoria/projects/task-manager/.worktrees/agent-platform`. Source formatting finished before these final checks; no later source/test changes were made.

| Check                  | Exact result and evidence                                                                                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`             | 107 total,106 passed,0 failed,1 skipped,21.69s. `/tmp/task6b0-npm-test.log`. The unchanged `real Supabase Auth, PostgREST joins, tenant repository and CAS round trip` SDK test remains gated and was not executed. Includes all32 local cases and the prior58 local/domain/repository regression subset. |
| `npm run typecheck`    | exit0, no diagnostics. `/tmp/task6b0-types.log`.                                                                                                                                                                                                                                                          |
| `npm run lint`         | exit0. `/tmp/task6b0-lint.log`.                                                                                                                                                                                                                                                                           |
| Scoped Prettier check  | All12 owned files matched style. `/tmp/task6b0-format.log`.                                                                                                                                                                                                                                               |
| `git diff --check`     | exit0 before staging; staged scope checked again before commit.                                                                                                                                                                                                                                           |
| `npm run check:tokens` | 234 public tokens,105 source files checked. `/tmp/task6b0-tokens.log`. This remains the existing JS audit; broad TS/TSX audit belongs6d.                                                                                                                                                                  |
| Cloud build            | `npm run build -- --outDir <fresh-cloud-dir> --emptyOutDir`, exit0,2.30s. `/tmp/task6b0-build-cloud.log`.                                                                                                                                                                                                 |
| No-cloud build         | Same command with VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY empty and separate fresh output dir, exit0,2.18s. `/tmp/task6b0-build-local.log`.                                                                                                                                                            |

Build runner `/tmp/task6b0-build.mjs` allocated both directories with mkdtemp. Exact paths are in `/tmp/task6b0-build-paths.json`. `/tmp/task6b0-build-scan.json` records two private configuration candidates, cloud4/local5 JS bundles (8/9 total text artifacts), zero literal private-value matches, and unchanged .env.local hash. This is a literal bundle scan, not a comprehensive security audit. No private values were printed or committed.

## Frozen browser gate

Root explicitly confirmed all worktree writes and builds stopped. I performed no worktree writes (including tests/docs/scratch) or builds during23:46:08.585–23:47:14.345UTC on2026-10-20. All test output directories were fresh temporary directories outside the worktree. The unchanged test suites generated their existing screenshots under /tmp. Root was notified and the freeze released only after all three suites finished and ports5180/5181 had no listeners.

The runner `/tmp/task6b0-browser.mjs` refuses occupied dedicated browser ports and forwards ignored local stack credentials without printing them. It runs these existing suites sequentially with `--output <fresh-temp-dir>`:

| Suite                        | Final result                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright.local.config.ts` | 5/5 passed,6.3s. `/tmp/task6b0-browser-local.log`; timestamps/output path in matching.json. Actual local create/edit/comment/switch/reload, corrupt-storage preservation, two-tab conflict recovery, system theme/pre-auth locale and first-entry secondary-workspace migration.                                                                  |
| `playwright.agent.config.ts` | 14/14 passed,44.2s. `/tmp/task6b0-browser-cloud.log`. Includes real dedicated local Auth/API cases, same-session draft/CAS/retry identity, delayed identity fencing, event boundary ordering and actual OAuth MCP agent write reaching an already-open task/activity. The original no-document-navigation assertion remains unchanged and passed. |
| `playwright.oauth.config.ts` | 6/6 passed,6.7s. `/tmp/task6b0-browser-oauth.log`. Real consent/PKCE/revoke, denial, activation failure, competing tabs and lost-response recovery.                                                                                                                                                                                               |

There were no failed browser attempts in this gate. No browser test/config assertions were changed. Dedicated stack61921 was used; .env.local and unrelated5173/5174 services were untouched. No reset, deployment or unrelated service stop occurred.

Inspected the legacy baseline `/tmp/task-manager-before-react.png` and fresh local desktop dark/EN drawer and mobile light/PT screenshots. The latter are preserved as `/tmp/task6b0-desktop-dark-en.png` and `/tmp/task6b0-mobile-light-pt.png`. They retain the existing React shell/drawer, neutral/indigo identity, literal title rendering and mobile cloud-required state. No UI markup/style was changed by this refactor; this is regression inspection, not a claim of legacy route parity.

## Handoff and limits

6b1 should consume `WorkspaceRepository` and the typed local factory already injected into App. Add new behavior in the appropriate family handler with a deliberate local-command-rules extension and projection updates when required. Keep new handlers inside the existing dispatcher/transaction; do not move CAS/version/event/receipt ownership into UI code. New lifecycle work remains in useWorkspaceData, and new drawer sections remain separate components. No whole-adapter assertion is needed for future consumers.

Dirty-editor composed actions, task table/filter/group/bulk behavior, drawer graph families, schedules/files and all project tabs/views are intentionally unimplemented here and remain assigned to6b1–6b4. Existing runtime payload validation is not replaced with new DTO schemas in this structural gate. Final entry cutover, legacy retirement, broader token audit and full parity remain later gates.

Full `npm run check` was not rerun or claimed green. Its14 preexisting backend/Deno formatter failures remain root-assigned6d follow-through; none of those unowned files was changed. Root plan/spec were excluded. No push/merge/deploy performed. Independent review is the next gate.

## Commit and self-review

Self-review checked the exact scoped diff, typed lifecycle/envelope checks, unchanged AST branches/helpers, absence of new command fields/storage keys, effective recurrence and returned-version regressions, local/cloud session boundaries, unchanged browser assertions and separation of root-owned files. Source commit is appended after scoped staging/commit.

Frozen source commit: `23addf34ad45d4399bb6dae2dafa0c4decb27bf1` (`refactor(ui): type the local repository and split mutation handlers`),12 owned files. Post-commit status contains only root-owned plan/spec modifications. The report remains in the requested ignored scratch path. Stop condition met for6b0; awaiting independent review.

# Task 6b0 fix round 1: check the actual adapter return path

Reviewed baseline: `23addf34ad45d4399bb6dae2dafa0c4decb27bf1`. The Important finding in `task-6b0-review.md` reproduced. The initial report's claim that the underlying command envelope was checked was too broad: the facade checked its own return expression, while `Promise<any>` accepted an invalid envelope from the actual adapter. This section supersedes that claim and its facade-only mutation evidence.

## Change and actual checked boundary

`local-panel.js` now has `// @ts-check`; its actual adapter object is contextually checked against the concrete `LocalPanelTransport` contract in `local-panel-types.ts`. That contract exposes concrete workspace/personal/preferences structures, `unknown[]` list payloads and `CommandResult<unknown>` command envelopes. The facade also consumes that contract. It no longer relies on accepting an untyped adapter result into an annotation.

The existing `guarded` helper is generic in the callback result T, and `local.js`'s existing persistence.transact callback/result is declared with the same T relationship. The persisted request-receipt envelope is typed as CommandResult<unknown>, so a conflicting fresh result cannot be erased by the receipt branch or the persistence return. Existing personal records/bookkeeping/workspace metadata receive structural types. Enabling checking for the whole adapter required explicit annotations for private dynamic legacy graph callbacks; those payloads remain opaque and no operation-specific DTO schema or runtime validator was added. Types for the already-existing envelopes do not create storage fields.

The application runtime did not change. The added annotations and type imports erase; the only emitted differences are redundant parentheses around JSDoc assertions. `/tmp/task6b0-r1-runtime-proof.mjs` transpiles baseline/current versions and compares their syntax trees while ignoring comments, parenthesis wrapper nodes and SourceFile's raw text. Operator trees, identifiers, literals and statement order are retained. Final output in `/tmp/task6b0-r1-runtime-proof.log`:

```text
unchanged runtime AST: src/workspace/local.js
unchanged runtime AST: src/workspace/local-panel.js
unchanged runtime AST: src/workspace/local-panel-repository.ts
```

The initial comparator included SourceFile.text, producing a false mismatch after added parentheses. A direct emitted-code diff identified that tooling mistake; the corrected comparator above establishes the stated runtime equivalence. The five mutation-family modules are untouched by this fix.

## RED, diagnosis and compiler proof

Added permanent `tests/local-panel-types.test.mjs`. It builds the actual TypeScript program using an in-memory compiler host, checks the adapter's public method result types, and mutates the actual adapter source without writing it to disk. It does not mutate the facade. Both mutation assertions require the resulting diagnostic to be located in `local-panel.js` itself.

- Before the fix, `node --test tests/local-panel-types.test.mjs` ->3 tests,1 passed,2 failed (`/tmp/task6b0-r1-types-red.log`). Public command output was any and actual `eventId: 123` produced no rejection. Actual method removal was already detected via the facade, so that test was honestly green at baseline.
- The first annotation-only attempt still failed2/3 (`/tmp/task6b0-r1-types-first.log`). Compiler inspection showed callback inference choosing the receipt envelope while unchecked JS suppressed the incompatible fresh-result branch. `/tmp/task6b0-r1-checkjs-diagnosis.log` records the inferred methods and diagnostics used to identify the missing actual-source checking. The solution enables checking of the actual module, rather than adding another cast or accepting that failed attempt.
- After the fix, the actual-source probes pass. Final-source output in `/tmp/task6b0-r1-tests-final.log` shows these public methods:

```text
command: (...) => Promise<CommandResult<unknown>>
workspaces: (...) => Promise<Workspace[]>
personal: () => Promise<PersonalState>
list: (...) => Promise<unknown[]>
preferences: () => Promise<{ favoriteProjectIds: string[]; favoriteTaskIds: string[]; notificationReadStates: Record<string, boolean>; }>
```

For actual `eventId: 123`, the compiler rejects the persistence callback's fresh result against its command-envelope return: `The types of 'value.eventId' are incompatible ... Type 'number' is not assignable to type 'string'.` For removal of actual `dispose`, the compiler reports that the actual object is not assignable to LocalPanelTransport because property dispose is missing. Full diagnostic text, not just pass counts, is emitted by the tests in the same log. Baseline compilation must have zero diagnostics before either mutation proof is considered.

## Final verification and scope

- `node --test tests/local-panel-repository.test.mjs tests/local-panel-types.test.mjs` ->35 tests,35 passed,0 failed,0 skipped,4.87s (`/tmp/task6b0-r1-tests-final.log`). All32 original adapter/storage/lifecycle/concurrency/recurrence cases run through the production facade, plus3 actual-source compiler tests.
- `npm run typecheck` ->exit0 (`/tmp/task6b0-r1-types-final.log`).
- `npm run lint` ->exit0 (`/tmp/task6b0-r1-lint-final.log`).
- Prettier check over the6 owned files ->all matched files use Prettier style (`/tmp/task6b0-r1-format-final.log`).
- `git diff --check` ->exit0; staged scoped diff checked again before commit.

Per root's bounded fix instruction, broad suites/builds/browser were not repeated: the runtime AST is unchanged and the covering local/compiler/type checks directly exercise the amended contract. Earlier frozen browser results remain evidence for the unchanged runtime baseline, not new browser executions. No freeze, server change, remote action, new behavior, storage rewrite or backend change occurred. The known14 global formatter issues still belong6d; no full npm-check claim is made.

Self-review covered actual-source diagnostics, generic callback/result propagation, typed receipts, preserved dynamic graph payloads, erased-runtime equivalence, all32 existing tests, unchanged handler modules, and exclusion of root plan/spec. Fix commit follows below; stop for independent rereview.

Fix-round source commit: `439101ad2b28f7ad1ef63f372e648482cdfdd54f` (`fix(ui): check the actual local adapter return contracts`),6 owned files. Post-commit status contains only root plan/spec edits. No push/merge/deploy. Stopped for independent rereview.
