# One scoped final-fix rereview

Archive note: this Markdown view is formatter-normalized from the [byte-identical original](final-residual-evidence/final-fix-rereview.raw.txt). Findings and verdict are unchanged.

Range: `063042547d4353f5ec693ab30eea3ad840da98cd..2f325a8cad66b75376b82bcddd19a2fc0daf00ff` (three commits, 82 files). Supplied package size verified: 403,790 bytes. Current HEAD matches. Migration009 SHA-256 matches `107140f3a400221adc6962e36c0670a07603e07598f9e54f296d38cdf37a428e`.

**Code verdict: residual changes/explicit root adjudication required.** Ten original IDs are addressed; I3 is not fully addressed because the bounded hydration change silently removes history from consumers that were not migrated. One additional minor projection inconsistency was confirmed. No critical finding. This is the single scoped rereview; it does not authorize another automatic fix/review loop.

**Activation verdict: not ready.** Shared/deployed runtime remains008.009 and its frontend must pass root's matched-runtime/live transport gate before publication. Actual Hermes/Claude/Vercel/retention/receiver gates remain separate.

## Per-ID disposition

| ID  | Status                       | Source and evidence assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | **ADDRESSED**                | `009:217–260`, MCP `tools.ts:90`, API `index.ts:94`: optional bounded task context, unchanged default delegation, twelve names, canonical comments/nullable author, scoped relation families, cursor binding including null rejection. Actual SDK InMemoryTransport + PGlite fixture verifies later-page body/author, deletion, populated contexts, wrong-kind/null/foreign-workspace and revoked-connection rejection. This is injected Auth/transport evidence, not live OAuth. Root's live gate remains required.                                                                                                            |
| I2  | **ADDRESSED**, with minor N2 | `009:5–17`, `:112–149`, `:200`, `:271`: optional renew transition, bounded reason, current claim/CAS and authority-before-replay retained; running/release/new claim/complete/intervention reset semantics are coherent. Changed blocked state/reason emits once through the transactional classifier; normal renewal/replay does not duplicate it. Fresh PostgreSQL/pgmq evidence and PGlite lifecycle checks support the implementation; mock UI shows a separate reason while workflow remains todo. Reservation presentation now has the minor inconsistency below; execution inactivity itself is correctly distinguished. |
| I3  | **NOT ADDRESSED in full**    | `useWorkspaceData.ts:109`, `:164–184`, bounded polling and `usePagedCollection.ts`: initial high-water precedes mutable reads; no eager historical page exhaustion; history/search/drawer/Inbox now have bounded reads and continuation. Deterministic hook evidence covers the hydration event race and failed-page recovery. However, project activity/overview, member activity and palette comment search still consume permanently empty historical arrays. See important N1.                                                                                                                                              |
| I4  | **ADDRESSED**                | `refresh-dependencies.ts` explicitly includes task/project calendar/notification/reaction cascades and conservative intervention/recurrence graph families. Command execution expands batch children; polling retains child events. Comments/reactions are now read on demand by updated detail consumers rather than falsely supplied as complete. Hook and isolated SQL evidence cover deletion/recurrence. The unrelated consumers missed by the hydration conversion are N1/I3, not an omitted cascade-map fix.                                                                                                             |
| I5  | **ADDRESSED**                | `TaskDrawer.tsx:81`, `:165`, `:560` composes discussion guard through a ref/getter with the existing core/subtask guard. `TaskDiscussionSection.tsx:54` includes pending attempt in unload protection. Close/workspace/back/uncertain-send mock preview evidence plus retained core-flush case support the exact original trigger. The report correctly discloses that a separate task-switch/subtask browser case was not added. Source uses the same shell guard path for those transitions.                                                                                                                                  |
| I6  | **ADDRESSED**                | `WorkspacePanel.tsx:220` retains the opened task snapshot by workspace/task scope; `TaskDrawer` receives explicit removed state, retains field values, disables writes and offers explicit discard. Two mock preview cases cover task/project deletion while dirty. Existing explicit confirmed-delete close path remains. No resurrection command is introduced.                                                                                                                                                                                                                                                               |
| I7  | **ADDRESSED**                | `NormalizedRepository.preferences(fresh)` and all changed refresh/favorite/copied-favorite/notification RMW callers request fresh reads. Two repository instances and actual-hook caller tests cover sequential other-tab data preservation. Simultaneous replacement merging remains explicitly outside this fix's proof.                                                                                                                                                                                                                                                                                                      |
| I8  | **ADDRESSED**                | `TaskViews.tsx:694–730` retains the attempted input/ID and disables title/project editing while uncertain; stable `taskCreateCommand` reconstruction preserves the central retry signature. Drawer additionally retains operation/input/version. Mock preview commits then drops response and verifies identical retry and one task. This addresses the original unchanged-retry trigger without weakening receipts.                                                                                                                                                                                                            |
| I9  | **ADDRESSED**                | `task-create-command.ts` composes create(todo) + complete(version1) in one batch; the drawer keeps Done visibly selectable for a new task. Raw create(done) stays rejected in cloud/local. PGlite/local atomic replay and local browser coverage of both inline Done and My Tasks→Completed drawer support it; SQL receipt/event totals correctly include two children plus the outer batch.                                                                                                                                                                                                                                    |
| M1  | **ADDRESSED**                | `usePagedCollection.ts:30`, `:43` consumes successful retry generation; later complete supplied data avoids duplicate reads. Actual-hook fixture covers the precise sequence. Failure retains cursor/reset and remains retryable, including refresh after a fully exhausted history.                                                                                                                                                                                                                                                                                                                                            |
| M2  | **ADDRESSED**                | Changed team harness uses distinct application names and waits for `pg_blocking_pids(waiter.pid)` to identify the winner before release. Both observer and winner barrier are bounded. Archived `m2.log` records observed distinct backends/lock contention and pass. No new race loop was run; this does not establish the cause of the separate historical webhook barrier timeout.                                                                                                                                                                                                                                           |

## Directly introduced residuals

### N1 — Important / P2: Historical snapshot consumers were left disconnected

**Changed source:** `src/app/shell/useWorkspaceData.ts:164`, `:173`, `:174`, `:184`.

**Affected consumers inspected:**

- `src/app/projects/ProjectDetail.tsx:99`, `:107`, `:118`, `:322`, `:443`: project Activity tab and Overview recent activity still derive their feed exclusively from `snapshot.events/activity/comments`.
- `src/app/panel/PeoplePages.tsx:306`: member recent activity still reads `s.activity`.
- `src/app/shell/WorkspacePanel.tsx:840`: command-palette comment search still reads `shown.comments`.

**Trigger:** Reload/open an existing workspace containing historical events, comments or activity, then open those surfaces. This occurs with a single historical record; it is not a large-workspace edge case.

**Impact:** The new hook clears events on initial hydration and always supplies empty comments/activity/reactions, correctly marked `historyComplete:false`. The listed consumers do not inspect that flag or perform a bounded read. Project historical activity therefore appears empty, its recent activity also disappears, member activity remains blank, and comment results never reach the palette. Even new polled comment events are explicitly filtered out in ProjectDetail because that component expects comments to come from the now-empty comments array. The standalone Search/History pages being correctly paged does not repair these separate existing affordances. No continuation, loading/partial explanation or link to recover the missing project/member/palette context is rendered there.

**Smallest correction:** Finish migrating these live consumers to bounded on-demand reads, including explicit continuation/partial-state behavior where filtering may match later pages. Retain context when routing to the already-paged search/history surface if that is root's chosen UX; do not silently represent unknown history as empty. Do not restore eager whole-workspace history hydration.

**Narrow proof needed if root elects to fix:** One existing historical project event/comment and member activity must remain discoverable after reload through project Activity/Overview and member context; a comment-only palette query must offer its result or an explicit paged/context-preserving route. Include a match on a later page and an event arriving after hydration. The existing broad passing suites need not be repeated to prove this residual.

**Reviewer reproduction:** An in-memory read-only probe transpiled the actual current `useWorkspaceData.ts` and `ProjectDetail.tsx`. The repository fixture offered one task/project plus one historical domain event, comment and activity row. After `refresh(true)`, the actual project component was evaluated for `tab:'activity'` with a JSX-tree shim; it passed an empty feed to `ActivityPage`. Output:

```json
{
  "probe": "I3 project activity consumer after bounded hydration",
  "availableHistoricalRows": { "events": 1, "comments": 1, "activity": 1 },
  "snapshotRows": { "events": 0, "comments": 0, "activity": 0 },
  "projectActivityFeedSizes": [0],
  "historyQueries": []
}
```

This proves the source-level consumer disconnect; it is not a browser or database acceptance run. The palette/member consequences follow the inspected reads above. This regression is directly caused by the I3 conversion and keeps that original ID incomplete.

### N2 — Minor: Revoked execution also changes lease projection, while mutation guards still honor the lease deadline

**Source:** `supabase/migrations/202610200009_task_context_execution.sql:22–32` versus `:63–66`; `src/app/tasks/TaskExecutionSection.tsx:50`, `:76`; `TaskDrawer.tsx:112`.

**Trigger:** An agent has an unexpired claim; its membership is demoted/revoked, or its OAuth authority is revoked; a human reads the task before the lease deadline.

**Impact:** `operation_task` changes `reservation.active` to false to represent lost execution authority. The human UI consequently labels the future reservation deadline as expired and enables ordinary completion/deletion/move affordances. SQL still computes `has_claim` solely from the unexpired claim and rejects those operations with `already_claimed`. The data remains protected and explicit Resume human control remains available, so this is a presentation/contract inconsistency rather than a security bypass or blocked recovery.

**Smallest correction:** Compute effective execution authority separately from the reservation deadline projection, or explicitly project the residual lock and use it consistently for action gating/text. Keep `execution.active:false` for revoked authority. Preserve the requirement for deliberate human intervention rather than silently bypassing the existing lock.

**Reviewer reproduction:** One fresh in-memory PGlite probe applied bootstrap/original+001–003/005–009, used synthetic owner/member identities, claimed a task as the member agent, demoted it to guest, then read/completed as owner. No network, shared database, files or services were involved. Output:

```json
{
  "probe": "revoked authority projection versus mutation",
  "reservationActive": false,
  "executionActive": false,
  "humanComplete": "already_claimed",
  "expiryInFuture": true
}
```

A narrow projection/action test can cover this if root elects to fix it. No broad race/security run is needed.

## Evidence and limits

Read the full scoped brief, original findings/triggers, final fix report, three final I1/I2/I3 rulings and relevant package groups. Reviewed all changed production logic for these IDs: migration009, Edge validation/API/MCP additions, repository/local pagination changes, hydration/dependency/paging hooks, drawer/discussion/create/blocked UI changes and RemainingRoutes. Inspected the directly affected unchanged ProjectDetail/member/palette reads only to trace the introduced regression; did not restart a whole-branch audit.

Read the new focused contract/hook/integration tests, changed browser/local tests and team contention harness. Inspected delivery SQL/contract logs, selected browser logs and M2's observed-contention result. Accepted recorded evidence with its stated provenance:

- 43/43 focused source tests before final SQL null-binding hardening; final SQL contracts3/3 and fresh PostgreSQL proof after that hardening.
- SDK context proof uses the real SDK over InMemoryTransport, PGlite and injected Auth fetch; PostgreSQL uses synthetic SQL principals and real pgmq/Vault. Neither is live Auth/API/MCP transport acceptance.
- Browser evidence is a latest-outcome union of six cloud-mode RPC-fixture preview and three local cases; local cases use dev mode. Build4's later paging retry change has a hook regression; it was not a new full browser run.
- Intermediate `npm test`:229 pass/2 live SDK skips, not a fresh final aggregate. Root owns the pending actual local SDK/full suite and009 transport gate on the exact reviewed runtime.
- Recorded type/lint/token/format/build/scans retain their source and pattern bounds. No new coverage percentage, a11y/security certification, production performance target or universal secret-scan claim.

Only the two concrete probes above were executed by this reviewer. No passing suites, builds, browsers or contention loops were rerun. Product/index/HEAD, shared services and remote state were untouched. The only review artifact written is this file.

## Final disposition for root

I1, I2, I4, I5, I6, I7, I8, I9, M1 and M2: **ADDRESSED** at source/scoped-proof level, with the explicit live-runtime limits above. I3: **NOT ADDRESSED in full** because of important N1. N2 is a separate new minor consistency issue.

**Merge/code approval is withheld pending root's adjudication of N1 under the one-fix-wave policy.** This report is complete and does not request another automatic review cycle. Actual activation remains unapproved independently, including009 deployment, matched frontend, real users/clients, receiver DNS/TLS, effective retention and end-to-end recovery/Cron gates.
