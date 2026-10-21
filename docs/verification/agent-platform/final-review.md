# Final whole-branch review

Reviewed range: `08a2a2ef9ce95391f8c31a072d319f71a10c63ee..063042547d4353f5ec693ab30eea3ad840da98cd` on `feat/agent-platform`.

**Ready to merge the code: No, important fixes are required. Actual production activation: No, independently of those fixes.** This is one consolidated review, not a sequence of partial fix requests. No product files, index, HEAD, deployments, services or credentials were changed during this review. No sub-reviewer was used.

## Strengths

- SQL authority checks precede receipt replay, and current membership, OAuth grant/connection and capability checks are enforced centrally. Tenant composite identities, workspace serialization, parent CAS and claim checks are much stronger than relying on UI controls or a previously valid token.
- Atomic commands keep their audit event and receipt together. Batch children retain checks and rollback together. The source-owned file/task-graph copy functions preserve unknown metadata without admitting arbitrary metadata writes. Team membership baselines address conflicts across different team rows.
- Migration freezes the old snapshot writer and preserves the original data; the final import boundary removes the runtime legacy renderer/Auth/snapshot repository. Historical fixtures are explicitly identified as historical compatibility proof.
- Webhook production source separates transactional enqueue, leased delivery and authenticated worker wake-up. It rechecks current authority, bounds attempts and network work, resolves and pins public addresses, retains the original TLS hostname, and rejects redirects. The documented trusted-SQL/Data API boundary is explicit.
- Repository lifetimes fence late responses after identity/workspace disposal. The panel generally preserves CAS failures and literal content; the shared strict DOMPurify helper is reused. Project/team editors contain useful removed-entity and ambiguous-response protections.
- The complete-discussion helper correctly distinguishes `undefined` from complete `[]`, filters task context and preserves explicit fresh retry. The findings below concern its callers/lifetime and the cost of obtaining complete workspace arrays, not that distinction.
- Evidence descriptions separate real local/hosted Auth and database checks, mocked browser paths, preview checks, synthetic principals and actual vendor activation. They retain prior failed attempts instead of representing a consolidated result as one fresh aggregate.

## Critical

None identified in the source reviewed. This is a bounded review conclusion, not a security certification or a claim of exhaustive absence of vulnerabilities.

## Important

### I1 — P1: An agent notified of a comment cannot fetch its content through the MCP contract

**Source:** `supabase/migrations/202610200005_ui_contracts.sql:351`, `:356`, `:309`; `supabase/functions/mcp/tools.ts:84` and `:93`.

**Trigger:** A human adds a new instruction or correction as a task comment. The assigned external agent receives `task.comment_added` and follows the documented instruction to fetch context over MCP.

**Failure/impact:** `get_task` returns the task row/reservation only. `list_task_activity` returns `domain_events`; the comment event contains IDs/version/status, not the comment body. None of the twelve MCP tools exposes `list_comments`. Normalized current subtasks/dependency/file context is also absent from `get_task`. In particular, the agent cannot read the new human instruction even with a valid write grant. This breaks the core comment-to-agent loop; the fact that the HTTP API has additional reads does not make them MCP tools or give the configured external agent that context.

**Smallest coherent fix:** Extend an existing read tool's authorized result with bounded, cursor-addressable current task discussion/context, keeping the twelve-tool constraint and the same live tenant/grant checks. Do not place arbitrary discussion bodies into the minimal webhook payload as a substitute. Define deletion/author representation and page semantics explicitly.

**Targeted proof:** Human writes a comment after agent connection; the actual SDK agent reads its exact body/author through the published MCP tools, including a later page. Cross-workspace and revoked-grant reads fail. Existing twelve-tool enumeration and minimal webhook payload remain intact.

### I2 — P2: Structured blocked execution and its advertised event are missing

**Source:** `supabase/migrations/202610200004_webhook_delivery.sql:129`; `supabase/migrations/202610200005_ui_contracts.sql:65` and `:119`; `src/app/tasks/TaskExecutionSection.tsx:37`. Requirements: design spec lines 79, 83 and 190; checked plan item at line 254.

**Trigger:** An agent cannot continue a task and needs to record a structured blocking reason for human supervision.

**Failure/impact:** The schema/contracts have claims but no task-run state or structured blocking reason. There is no accepted operation field/transition to report this state. The webhook classifier emits `task.run_blocked` only when event payload status is `blocked`, but task status validation permits the separate five-state workflow and no operation can produce that status. The UI shows assigned/reserved/expired, without a blocked execution reason. A live lease preventing a human edit is a different condition. The named event is subscribable yet unreachable in the supported command path.

**Smallest coherent fix:** Add the missing execution state/reason and authorized run transition, project it to the existing task read/supervision UI, and emit `task.run_blocked` from that execution transition. Preserve task workflow statuses, CAS/current claim authority and the twelve-tool limit. If root intends to defer this acceptance, record an explicit scope decision and remove the completed/implemented claim; it is not currently implemented merely because leases work.

**Targeted proof:** Current claimant records blocked reason; UI and MCP read it; one durable event is enqueued; stale/revoked claimant cannot alter it; human intervention invalidates the previous execution authority.

### I3 — P2: Workspace history growth makes ordinary panel hydration consume an unbounded request budget

**Source:** `src/app/shell/useWorkspaceData.ts:100`, `:105`, `:163`, `:171`; `src/workspace/normalized.ts:80`; `supabase/migrations/202610200002_agent_operations.sql:65`.

**Trigger:** An actively used workspace accumulates agent events, comments and historical activity; a person opens/reloads it, or an event refreshes those collections.

**Failure/impact:** Initial hydration exhausts every `list_domain_events` page before loading tasks, then exhausts all comments, reactions and activity as part of the main snapshot. Each relevant refresh repeats full collections. `list()` uses 100-row requests, and each read consumes the same actor/client/connection quota of 240 units per minute across workspaces/tabs. For example, 24,001 events alone require 241 requests if read in one quota minute, before the rest of the workspace. This is a source-derived failure condition, not an invented scale target or measured throughput claim. A failed initial load retains no completed pagination progress; retry starts the scan again. Even below that threshold, history growth consumes increasing budget before routine task work. Removing duplicate drawer reads improves the existing fixture but does not bound this cost.

**Smallest coherent fix:** Separate the initial event high-water boundary from full historical browsing, and make discussion/activity/history retrieval incremental or on demand with resumable, budget-aware pagination. Preserve full results for explicitly requested history/search and preserve the pre-hydration event boundary; do not silently cap results or simply raise the quota. Root should choose the smallest supported UX/query contract for this change.

**Targeted proof:** A deterministic repository/transport fixture with history requiring more than the per-minute budget demonstrates that opening tasks does not need to exhaust that history, later pages remain accessible, and an event committed during hydration is still applied. Keep the existing 102-case fixture/quota unchanged. A broad load benchmark is unnecessary to prove this finite-budget mismatch.

### I4 — P2: Cascades and intervention leave authoritative collections stale

**Source:** `src/app/shell/useWorkspaceData.ts:130` through `:174`; SQL deletion at `supabase/migrations/202610200002_agent_operations.sql:184`, calendar deletion at `:196`; intervention at `supabase/migrations/202610200005_ui_contracts.sql:230`.

**Trigger:** Delete a task with a calendar event/notification, delete a project with task notifications/reactions, or use human intervention to delete a reserved task / complete a recurring task.

**Failure/impact:** The refresh dependency regexes omit `delete_task` for calendar events, task/project deletion for notifications, `delete_project` for reactions, and `intervene_task` for the related collections. SQL deletes the task-owned graph, but the client retains comments/reactions, subtasks, task-label/dependency links, files/attachments, notifications and calendar events on intervention-delete. Intervention-complete also creates recurrence children/labels without refreshing those collections. The task list refreshes, giving a misleading mixture of new task state and old graph. The event cursor is then advanced, so subsequent empty polls do not repair the stale graph. Phantom calendar events and global file entries are directly visible; stale complete discussion arrays also suppress fallback reads.

**Smallest coherent fix:** Replace the incomplete regex dependency list with an explicit command/cascade dependency map. Include task/project deletion's notification cascade, task deletion's calendar cascade, project deletion's reaction cascade and both intervention outcomes; because polling currently supplies operation names without action, conservatively refresh affected task graph families for `intervene_task`, or propagate a trustworthy action descriptor. Include batch child operations.

**Targeted proof:** Use the real hook with a repository fixture, and a narrow UI/DB case for task/calendar deletion and intervention-delete/recurrence. See the successful reproduction below. Validate each affected collection, not merely disappearance of the task row.

### I5 — P2: The task drawer never registers its discussion draft guard

**Source:** `src/app/tasks/TaskDrawer.tsx:157` and `:520`; `src/app/tasks/TaskDiscussionSection.tsx:50` and `:65`. The Inbox caller correctly supplies `registerDraft` at `src/app/panel/RemainingRoutes.tsx:465`.

**Trigger:** Type a comment in the task drawer without changing task fields, or receive an ambiguous comment-send failure, then close the drawer / switch task / navigate / change workspace.

**Failure/impact:** The discussion component retains a body and retry attempt but its guard is optional. The drawer omits the callback and tracks only core fields, busy and subtask dirty state. Once the request is no longer busy, the shell can consider the drawer clean and unmount it, losing the unsent text or the identity needed to recover an uncertain send. The discussion's unload protection also depends on the omitted callback.

**Smallest coherent fix:** Compose a discussion guard into the drawer's existing guard rather than allowing child and parent to overwrite the same registration. Keep the comment body and attempted ID/payload until successful send or intentional permitted discard. Block leaving while an ambiguous send requires recovery.

**Targeted proof:** Close, browser-back, task switch and workspace switch retain/block an unsent reply and an ambiguous failed send; retry produces one comment. Confirm core-field/subtask guards still work together.

### I6 — P2: A remote task deletion unmounts a dirty drawer before its guard can run

**Source:** `src/app/shell/WorkspacePanel.tsx:739`; `src/app/tasks/TaskDrawer.tsx:157`.

**Trigger:** A person edits a task title/description while another authorized actor deletes that task or its project; polling applies the deletion.

**Failure/impact:** Rendering requires `selected` to remain in the current snapshot. Its disappearance unmounts `TaskDrawer` immediately, bypassing navigation and clearing the draft registration in cleanup. Unsaved text is lost even though the user never chose to leave. Project/team editors already retain an editor snapshot and describe a removed entity; the task drawer lacks that equivalent. This also matters after an uncertain write/deletion response.

**Smallest coherent fix:** Retain the open task's editing snapshot/draft independently of the live list until the user explicitly resolves it. Mark remote deletion, prevent writes that would accidentally recreate it, and allow copying or explicit discard/recovery. Do not keep pretending the entity still exists.

**Targeted proof:** Second actor deletes a task and separately its parent project while the first drawer is dirty. Polling shows the removed state without losing text or resetting a pending attempt. Explicit user-confirmed deletion still closes normally.

### I7 — P2: External preference changes are reread from stale cache and can be overwritten

**Source:** `src/workspace/normalized.ts:71` and `:110`; `src/app/shell/useWorkspaceData.ts:129`, `:301`, `:312`.

**Trigger:** The same signed-in person changes favorites or notification read states in another tab/device, then the first tab processes the `set_preferences` event or toggles another favorite/read state.

**Failure/impact:** `preferences()` uses cached `query('get_preferences')`. Event refresh and even `refresh(true)` call the same cached method. The cache has no TTL; it is cleared by local commands/disposal or eventual eviction, not by the external event. The first tab can therefore remain stale and construct a replacement favorite array/read-state map from old data, discarding the other tab's already committed entries. This is sequential stale-cache loss; a simultaneous write race is not needed.

**Smallest coherent fix:** Add a fresh/invalidate path for preference event refresh and preference read-modify-write callers. Use it before deriving the replacement collection. Preserve current-user scoping; consider a server merge/CAS separately if simultaneous updates must also be protected.

**Targeted proof:** Two repository instances for the same identity: B adds a favorite, A refreshes and adds another; both remain. Repeat for notification state. An isolated production-repository probe below confirms that the current method makes only one RPC and returns the old array.

### I8 — P2: Retrying inline task creation generates a new logical operation

**Source:** `src/app/tasks/TaskViews.tsx:702` and `:617`; `src/app/shell/useWorkspaceData.ts:265`.

**Trigger:** The grouped inline composer sends `create_task`; the server commits but the response is lost. The visible error leaves the title in the composer, and the user retries unchanged.

**Failure/impact:** Every submit generates a fresh task ID. `execute` keys retries by the entire operation/input/version signature, so the second ID also selects a fresh idempotency key. Both server requests can succeed, producing duplicate tasks. The central retry map cannot repair a caller that changes the operation identity. Editing while outcome is uncertain similarly abandons the original attempt.

**Smallest coherent fix:** Store the exact submitted input/ID for the outstanding composer attempt, freeze editing while its outcome is uncertain, and retry it unchanged. Clear it only on authoritative success or an explicitly known non-committing failure; allocate a new identity for the next intentional task. Match the stronger comment/team attempt handling already present.

**Targeted proof:** Commit then drop the first response, submit again, and assert one task/event/receipt with unchanged ID/key/payload. Include changed-title behavior while recovery is required.

### I9 — P2: Creating inside a completed group sends a forbidden create status

**Source:** `src/app/tasks/TaskViews.tsx:703`; `src/app/panel/RemainingRoutes.tsx:253` and `:319`; `src/app/tasks/TaskDrawer.tsx:87`, `:125`, `:286`; rejection at `supabase/migrations/202610200005_ui_contracts.sql:119`.

**Trigger:** Add a task in the Done column/group, or use My Tasks → Completed → Add task in this group.

**Failure/impact:** The inline composer or creation context sends `create_task` with `status: 'done'`, which the command validator rejects because completion must use `complete_task`. The drawer initializes internal status to `done` but removes that option for a new task, so the visible selection can disagree with what is submitted. These visible creation affordances fail in cloud mode.

**Smallest coherent fix:** Route completed creation through an atomic create-then-complete batch with stable IDs/ordered CAS, or explicitly prevent completed-group creation and choose a valid visible initial status. Preserve the completion/recurrence contract; do not weaken the validator just to make the form pass.

**Targeted proof:** Both completed-group entry points create exactly one appropriately completed task or clearly offer only a supported state; visible selection and submitted state agree. Retry the composed command without duplicates.

## Minor

### M1 — Explicit detail retry permanently disables complete-graph reuse for that mounted hook

**Source:** `src/app/shell/useWorkspaceData.ts:367`, `:389`, `:399`.

`attempt` only increments. After one successful explicit retry, every later revision still passes `force=true`, repeating task comments, all workspace reactions and task activity reads even when complete authoritative arrays are supplied. This reintroduces the duplicate-read behavior the 6d fix intended to remove for the rest of the drawer lifetime. **Fix:** consume the retry generation for that request and return to normal complete-graph reuse after it succeeds; keep the ability to retry a subsequent failure. **Proof:** complete graph → explicit retry causes fresh reads → later ordinary revision causes no duplicate discussion reads. The helper tests exercise force directly but do not exercise this hook lifetime. This is a concrete efficiency regression; the broader quota/hydration issue is I3.

### M2 — The team race harness does not establish observed contention

**Source:** `supabase/tests/team-membership-baselines-postgres.sh:29` and `:33`.

A two-second SQL sleep and a half-second shell sleep aim to overlap sessions, but do not prove that the second operation has reached the contested lock before the first commits. Under scheduling delay, a sequential stale-baseline rejection can pass. **Fix:** add a bounded observer/barrier using distinct backend identifiers and evidence that the waiter is blocked, then release the winner. Preserve rollback/replay assertions. The actual independent backend outcome and hosted one-200/one-409 evidence remain useful; this finding does not invalidate the SQL baseline logic or claim an observed product race.

## Checks performed and evidence limits

### Source actually read

I used the supplied diff inventory and final source in grouped passes, rather than rereading the 3.96 MB package or treating every archived review as instructions to rerun it. This is a whole-branch integration review of the final source, **not a claim that all 399 changed files or every deleted renderer line were read line by line**.

Read the authoritative design spec, relevant approved plan sections/acceptance entries, the requested reviewer template and applicable global instructions. The production behavior read covers:

- All eight new SQL migrations (001–008), including current replacements/wrappers, RLS, migration, grants, command/read execution, graph deletion/copy and webhook delivery/scheduler functions. Relevant original migration boundaries were inspected by targeted searches, not a new full review of the unchanged base migration.
- All production API/MCP/webhook Edge entrypoints and `_shared` auth/errors/operations/validation/team-membership/target/delivery/signing modules; the setup-webhooks and local OAuth setup scripts.
- Domain contracts/legacy mapping; normalized and local repositories/adapters, DTO/rule/device-preference modules and local mutation modules; shared task operations and calendar/rich-text/i18n/utils code.
- App/Auth/consent/connections, shell/navigation/data hook, every task component/model, project pages/editors/sharing/saved views/models, schedules/files, people/settings/remaining routes/catalogue/palette, agents/integration/activity and UI primitives. `local-panel-types.ts` was not independently read in full; its checked boundary and archived type proof were inspected through consumers/evidence.
- Package/build/CI/TypeScript/lint configuration, the React token auditor, and current import-closure/evidence boundaries. I did not independently line-audit all CSS, locale catalogs, lockfile entries, the 8,553-line OpenAPI document, the legacy fixture bodies, every test body, or the complete historical report archive.
- Fully read the focused discussion-data and normalized-repository tests and team concurrency harness; inspected relevant browser test names and evidence/report sections. Existing browser/source/backend suites were not rerun.

### Targeted reproductions, without product writes

A small in-memory harness transpiled the actual `useWorkspaceData.ts` with TypeScript and injected state/effect shims plus a repository fixture. It called `refresh(true)` with a task and its graph, then replaced server fixture rows with empty lists and called `refresh(false, [operation])`. The harness observed state setters/read calls; it did not emulate a browser or independently execute PostgreSQL cascades. Those cascades were read from SQL.

- `delete_task`: initial task/calendar/comment rows; after authoritative deletion, output was `{"probe":"delete_task invalidation","calendarEventsRemaining":1,"refetchedCalendar":false,"commentsRemaining":0}`.
- `intervene_task`: initial task/comment/file/subtask/attachment graph; after authoritative deletion, output was `{"probe":"intervene_task delete invalidation","commentsRemaining":1,"filesRemaining":1,"subtasksRemaining":1,"refetched":["list_tasks","list_projects","list_agents","list_activity"]}`.

A second in-memory probe transpiled the actual `NormalizedRepository`, with a fake Supabase RPC returning current-user preferences. After one read, the server fixture changed from `['first']` to `['first','added-in-other-tab']`; another `preferences()` call produced:

`{"probe":"external preferences update","serverFavorites":["first","added-in-other-tab"],"observedFavorites":["first"],"rpcCalls":1}`.

Both probes were read-only production-source evaluations, not passing acceptance tests or real Auth/database proof. Other findings are direct source/contract traces with explicit triggers; their targeted regression proofs are requested above.

### Existing evidence considered

The verification overview/archive index, 6d report/current rereview, hosted preactivation report and final rulings were examined for scope/provenance, with targeted earlier reports and logs. I accept their recorded executions as existing evidence, without relabeling them as fresh runs by this reviewer:

- Full runtime source check: 212/212, zero skips, real SDK. Later tooling-only work: 24/24 and full source token audit 234 tokens/99 files, lint/format/scans. This is not a new post-tooling 212-case aggregate.
- Browser summary: latest-outcome union of 114 named case/mode results, explicitly consolidated from full and focused runs. Real local Auth/database, mock paths and preview modes remain distinct.
- Supported Deno check/live tests (28 plus focused TLS 2), real Edge and PostgreSQL suites including 008 are reported. The expanded fixture command's 11 type errors remain disclosed; frontend tsc does not prove every Deno fixture was typechecked.
- Fifteen backend formatting files have recorded AST equivalence. The final source/build scan is bounded to 346 files and two known private candidates, zero findings; it is not a universal secret/vulnerability audit.
- Current chunk split resolves the previous 576 kB warning (reported maximum 480.63 kB). Historical external-output-directory warnings and the separate owned clean-build proof are correctly distinguished.
- Hosted reviewed 008 and prior API/MCP regressions use real hosted transports/Auth with disposable synthetic principals. Admin setup/inspection authority is not confused with the human JWT/PKCE authority performing observed business operations.

## Declined to judge / explicit limits for root

The following are deliberately not accepted as proven production behavior or universal coverage. Root must retain/resolve these limits rather than treating a missing new finding as approval:

1. **Actual production activation:** public Vercel frontend, callback/Auth URL/CORS configuration, two actual personal Claude accounts and their isolation/revocation, live Hermes main-profile configuration, public DNS/TLS/webhook route and end-to-end failure/resume. These remain outstanding gates; synthetic principals, isolated Hermes and local preview do not substitute. No browser/CLI workaround was attempted for the reported Vercel access block.
2. **Hermes production profiles and receiver operations:** the isolated pinned 5/5 synthetic-provider/home/SQLite-admission restart evidence is useful but does not prove the actual server/main profile has been configured/restarted or that all existing profiles remain healthy. Lili remains out of scope. I did not inspect or operate the live server.
3. **Cron delivery activation:** the real hosted empty-queue authenticated wake-up proves that boundary, not delivery to the real receiver. Cron remains disabled. Enabling it before receiver/subscription/revocation gates is not approved by this report.
4. **Retention/pruning and sustained operational growth:** actual pruning, production retention settings and recovery under sustained backlog have not been demonstrated here. I3 is a code finding even before a production capacity target exists. No arbitrary scale target or broad benchmark is assumed; root should name the retention/operational proof before activation.
5. **Historical SQL webhook barrier timeout:** the prior eight-second failure's actual cause remains unproven. Safe phase/backend-session diagnostics address the known observer hazard; I did not infer they solved every possible cause or rerun race loops. If it recurs, use those diagnostics to prove the phase/waiter before changing a timeout. Team harness contention quality is separately triaged as M2.
6. **pg_net headers and database-operator trust:** the accepted design isolates the exposed Data API and keeps API roles NOLOGIN; trusted SQL operators can inspect vendor transient request headers. I did not certify secrecy against those operators. This is a documented boundary, not a claim that API hiding revokes vendor SQL ACLs.
7. **Universal accessibility/visual parity/performance certification:** existing scoped browser evidence and inspected semantic controls do not establish full WCAG compliance, every viewport/assistive technology, every historical visual detail, or a production performance SLO. CSS/locale catalogs were not independently line-audited in this pass.
8. **Dependency/security/coverage metrics:** no new dependency advisory/license audit, penetration test, coverage-percentage computation or cyclomatic-complexity measurement was run. No 80% coverage or complexity-under-10 claim is made. Lockfiles/OpenAPI/generated documentation and all test bodies were not exhaustively audited.
9. **Every historical renderer/test artifact:** retirement was assessed through final imports, runtime boundaries and evidence provenance; pure deletions and archived reports/fixtures were not re-reviewed line by line. Their presence is not runtime coverage. No feedback is issued on unread source bodies.
10. **Explicitly excluded product capabilities:** model hosting/management, a separate Node/TanStack backend, automatic cloud demo import, file-byte upload, and automatic personal-Claude execution are out of scope, as are real billing/MFA/session-management behaviors labeled local demonstrations. I did not ask for those features. Existing unavailable cloud access-management UI is not evidence of implemented invitation/private-project permissions.
11. **Additional concurrent preference merge policy:** I7 proves sequential stale-cache loss. Simultaneous preference writes would require a separately specified merge/CAS expectation and focused proof; this review does not claim a safe concurrent merge simply after cache freshness is fixed.
12. **Structured blocked execution:** this was not silently deferred: I2 explicitly identifies the unmet accepted requirement. Root must either implement it or make the scope change visible; an earlier stage approval alone does not resolve it.

## Verdict

**Code: changes required before merge.** Address I1–I9 in the single authorized fix wave, with scoped regression evidence for their concrete triggers. M1 is a small, directly related hook-lifetime fix worth including; M2 is a non-blocking harness-strengthening item with its proof limits recorded. Do not broaden validation into repeated passing full browser/build/race runs without a changed risk that justifies them.

**Actual activation: not ready.** Even after code fixes and scoped rereview, the production frontend, actual Claude users, Hermes/DNS/TLS/receiver, retention and end-to-end recovery gates remain separate. No push/merge or remote activation is performed or implied by this report.
