### Spec Compliance

- ❌ Issues found. The requested detail families and table controls are implemented, but the embedded-file preservation requirement fails when linking to an earlier task (I1), and live subtask deletion can silently discard an unsaved detail draft (I2). Task 6b2 is not ready to pass its independent gate.
- ✅ Scope: canonical label/dependency editing, child details/promotion, metadata-only attachments, discussion/reactions, activity and personal actions are present. Evidence: `src/app/tasks/TaskDrawer.tsx:429`, `src/app/tasks/TaskCells.tsx:169`, `src/app/tasks/TaskCells.tsx:188`, `src/app/tasks/task-detail-model.ts:3`, `src/app/tasks/TaskAttachmentsSection.tsx:32`, `src/app/tasks/TaskDiscussionSection.tsx:45`, `src/app/shell/useWorkspaceData.ts:179`.
- ⚠️ Cannot verify from this diff: unchanged server/API/MCP authorization, PostgreSQL concurrency invariants, snapshot cutover authority, and complete secret exclusion from all server events/logs. The changed UI continues through the existing repository command path; cloud and actual MCP regression evidence is present, but this task gate is not a new audit of the unchanged backend. Root should retain the preceding backend gates and separate activation gate.
- ⚠️ Cross-task requirements: global files/calendar/timeline remain 6b3, project integration remains 6b4, other routes remain 6c, and final cutover/permanent parity documentation/global formatter cleanup remain 6d. No full route parity or final activation approval is implied.

### Strengths

- Cohesive sections replace the growing drawer's inline detail implementation. Parent and child edits use explicit save/discard guards; the table uses the existing command preparation rather than inventing another parent CAS path: `src/app/tasks/TaskDrawer.tsx:146`, `src/app/tasks/TaskDrawer.tsx:429`, `src/app/tasks/TaskSubtasksSection.tsx:177`, `src/app/tasks/task-view-model.ts:153`.
- Canonical graph reads are shared with the drawer and view filtering. Hydration still reads the event boundary first, empty polls do not refresh rows, and successful command operations supplement event-based invalidation after an event-read failure: `src/app/shell/useWorkspaceData.ts:49`, `src/app/shell/useWorkspaceData.ts:120`, `src/app/shell/useWorkspaceData.ts:165`. The new browser regression explicitly checks the one-read empty poll and failed-event recovery: `tests/browser/agent-panel.spec.ts:1173`.
- Local mutations remain inside the existing transaction/receipt path, with ordered batch operations and a 100-child limit. Reactions and comment receipt replay recheck the real local actor, distinct from the personal cache identity: `src/workspace/local-panel.js:229`, `src/workspace/local-panel.js:266`, `src/workspace/local-panel.js:277`, `src/workspace/local-mutations/comments.js:33`.
- Tests exercise actual local persistence and real authenticated cloud commands, not just rendered mocks. The cloud detail case covers canonical joins, authored reactions, favorites, promotion and an active claim; the MCP case retains the no-document-navigation assertion after an external comment: `tests/browser/agent-panel.spec.ts:1053`, `tests/browser/agent-panel.spec.ts:723`, `tests/task-details.test.mjs:20`.
- Screenshot inspection supports the bounded visual claim: desktop dark, mobile PT/light and claimed cloud drawer reuse the existing typography, spacing and colors. The metadata preview clearly says that bytes are not stored. These screenshots do not prove complete application parity.

### Issues

#### Critical (Must Fix)

- None found in this bounded review.

#### Important (Should Fix)

- **I1 — Linking embedded metadata can transfer ownership and hide unknown fields.** `src/workspace/local-mutations/task-details.js:27`, with `src/workspace/local-dto.js:96`. A new attachment link copies only ID/name/type/size/order. Unlike unlink/update, set does not materialize an embedded-only file's canonical record before adding the link. When the receiving task precedes the original parent in `data.tasks`, `localFiles` now encounters this reduced copy first, assigns the receiving task as owner, and drops the original unknown metadata from the canonical projection. This also changes which task deletion is protected. A focused actual-adapter probe reproduced it with a unique embedded file: before `{owner:"t49", unknown:{retain:true}}`; after attaching to `t1`, `{owner:"t1"}`. Both `ownerPreserved` and `metadataPreserved` were false. Materialize the full canonical record, retaining explicit null ownership and unknown fields, before any set operation can introduce an earlier competing embedded copy. Add a regression that attaches to an earlier task, reloads, then unlinks/deletes in both directions; the existing shared-file tests choose a later consumer and miss this case.

- **I2 — External child deletion silently destroys a dirty child draft.** `src/app/tasks/TaskSubtasksSection.tsx:41`, `src/app/tasks/TaskSubtasksSection.tsx:89`, `src/app/tasks/TaskSubtasksSection.tsx:152`. The editor exists only while the selected ID is found in the live `subtasks` prop. If another client deletes that subtask while the user has unsaved title/notes/date, the new event-driven graph refresh removes the row. React unmounts `SubtaskEditor`, loses its local draft state and runs the cleanup that clears the dirty guard. The drawer can then close normally, without the explicit discard/recovery promised for these details. Keep the selected editor/draft independently of the live collection while dirty, represent remote removal as a conflict, and require an explicit discard or recovery decision. Add a focused visible regression for remote deletion while child notes are dirty. This finding follows directly from the render and cleanup paths; no browser rerun was used to claim a reproduction.

#### Minor (Nice to Have)

- None required for this gate beyond the verification limitation below.

### Verification and Limits

- Reviewed the complete 3,850-line package `review-49e9a03..c59dd80.diff` once in consecutive, untruncated chunks. Scope: base `49e9a03cf6773fcb241e30ef0b22912253be7fea` to head `c59dd80c3dc370eed2ba2d2fc61054c4ac4bff31`, 26 changed source/test files. No git commands, source/index/HEAD/branch mutations, subagents, browser/service starts, resets, builds or deployments were performed.
- Two focused changed-file context reads filled mid-function omissions in the diff: `TaskDrawer.tsx:359` for the existing conflict-recovery button and `useWorkspaceData.ts:143` for the beginning of execute/receipt handling. These were needed to assess child conflict recovery and command retry semantics. No broader codebase crawl was performed.
- Ran one new focused in-memory probe only, using `createLocalWorkspaceRepository` and the actual command implementation to test the uncovered earlier-task attachment ordering risk in I1. It emitted only task IDs and preservation booleans. It did not persist files or alter checkout data. No passing suite was repeated.
- Read `/tmp/task6b2-final-focused.log`: 59 tests, 59 pass, 0 fail, 0 skip, 5.89 seconds.
- Read `/tmp/task6b2-local-full-final.log`: 22 browser tests passed, 45.1 seconds.
- Read `/tmp/task6b2-cloud-full-green.log`: 18 browser tests passed, including actual OAuth MCP, external comment/no-navigation, 102-task cursor and actual detail tests; 1.2 minutes. Detail RPC counts: 152 read 200, 9 execute 200, 3 member-list 200; no 429 in that completed flow. This evidence predates the final local-only projection changes, which the report discloses and the final local/focused evidence covers.
- Read `/tmp/task6b2-final-unit.log`: the broad run is **131 tests / 129 pass / 1 fail / 1 skip**, not green. The failure is the existing `tests/webhook-sql.test.js:9` assertion after a `supabase/tests/webhook-recovery.mjs:38` PostgreSQL barrier timeout; SQL assertions and the secret-lock regression had already printed success. Read `/tmp/task6b2-webhook-isolated.log`: isolated test passed once in 18.85 seconds. No backend source changed in this package, so the available evidence does not attribute that failure to 6b2 or establish that it is harmless/flaky. Retain it as an unresolved broad-validation concern for root/final integration; it does not explain away I1/I2 and is not a fabricated broad pass.
- Read cloud/local build logs, `/tmp/task6b2-build-scan.json` and `/tmp/task6b2-build-paths.json`: both builds completed; the scan recorded two private credential candidates, zero literal matches, and unchanged `.env.local`. This supports that bounded scan only. Typecheck/lint/format/token claims have no named raw log in the supplied report and were not independently rerun or upgraded to newly observed results.
- Inspected `/tmp/task6b2-metadata-preview.png`, `/tmp/task6b2-local-details.png`, `/tmp/task6b2-mobile-light-pt.png`, `/tmp/task6b2-cloud-details-claim.png` and `/tmp/task-manager-before-react.png` directly, without starting another browser.

### Assessment

**Task quality: Needs fixes.**

**Reasoning:** The component decomposition, transaction reuse and verification evidence are substantial, but a reproduced ownership/metadata regression and a deterministic unsaved-draft loss prevent acceptance. Fix I1/I2 with focused regression evidence, preserve the existing passing results, and retain the disclosed broad SQL concern separately.
