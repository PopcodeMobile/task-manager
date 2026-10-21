# Task 5 scoped rereview, round 1

Spec compliance: **Approved for Task 5**. Both original Important findings are resolved within the agreed task boundary.

Task quality: **Approved**. No new Critical or Important defect identified in the fix-only diff.

Reviewed range: `1413ccac33442a6aada193a2c3b7fbc492f0a140..734c48272511a40398d286810a9935105073dea6`.

## Finding verdicts

1. **Important 1, token-refresh draft loss: resolved.** `src/app/App.tsx:59` now keys the panel by `sessionBoundary`. `src/app/auth/AuthProvider.tsx:45` maintains a boundary from user ID, session ID and an epoch; routine refresh within that identity retains the epoch, while clearing or replacing the identity/session changes it. The decoded claim is used for local state partitioning, without introducing authentication authority or a second client. `tests/browser/agent-panel.spec.ts:529` drives the actual SDK refresh method with controlled Auth responses, verifies the failed-save draft survives, asserts the original CAS version and exact retry idempotency key, then verifies replacement session and replacement user both reset the draft. Existing workspace/logout races remain in the passing panel suite.

2. **Important 2, actual MCP-to-polling proof: resolved.** `tests/browser/agent-panel.spec.ts:583` now creates a disposable real Auth user and exercises registration, authorization/PKCE, attempt-bound consent preparation/approval/activation, OAuth token exchange, and the official MCP client's HTTP transport. The task claim and update go through MCP using the real OAuth token and returned lease/CAS. The already-open browser observes the changed title and agent activity; the test asserts zero subsequent main-frame document navigation requests and verifies agent/client attribution in the audit event. Service credentials are confined to fixture provisioning/cleanup, not the application writes being proved. Cleanup uses an explicit human intervention and preserves a primary test error; the final affected case was rerun after the cleanup-only lint correction.

3. **Minor, table semantics: resolved.** `src/app/tasks/TaskList.tsx:128` now provides column headers and cells, retaining the real button inside the title cell. The focused width rule at `src/app/shell/workspace.css:903` preserves the title's grid width. The core browser test at `tests/browser/agent-panel.spec.ts:215` asserts five headers and five cells for its one-task fixture.

4. **Minor, lifecycle/section extraction: accepted deferral.** Existing large components were not expanded by this fix. Extraction remains the agreed nonblocking Task 6a follow-through; no broader refactor is required to close this gate.

## Evidence inspected

- `/tmp/task5-r1-panel-final.log`: 14 passed, including token rotation, prior workspace/logout fencing, table roles and actual OAuth MCP polling.
- `/tmp/task5-r1-oauth-final.log`: 6 passed.
- `/tmp/task5-r1-cleanup-final.log`: the final affected MCP case passed, 1/1, after the cleanup-only test change.
- `/tmp/task5-r1-session-red.log` and `/tmp/task5-r1-session-green.log`: initial regression failure and subsequent 2/2 focused pass.
- `/tmp/task5-r1-mcp-red.log` and `/tmp/task5-r1-mcp-green2.log`: missing-origin assertion failure and subsequent real-transport acceptance pass.
- Inspected `/tmp/task5-r1-real-mcp-task.png` and `/tmp/task5-r1-real-mcp-activity.png`: changed title, real executor display, reservation activity and agent-authored update are visible in the preserved Gr8r visual system. Screenshots corroborate the UI state; transport provenance is established by the test code and passing run, not screenshots alone.
- No warning/error noise appeared in the inspected final passing logs. Final scoped lint, typecheck, build, tokens and format results are recorded in the appended implementation report; they were not rerun during this review.

## Scope and stopping condition

Read the supplied fix-only diff once in two bounded chunks and the appended round-1 report. No git commands, changed-file rereads, unchanged-source crawl, subagents, suite reruns or new runtime tests were needed. No source/index/HEAD/shared/cloud state was changed; only this rereview file was written.

Exact callback allowlist registration remains the explicitly accepted activation follow-through. This approval does not claim actual email confirmation/recovery delivery or complete Task 6 route/local/cutover parity. Original review limits on coverage metrics, broad dependency auditing and large-workspace performance remain unchanged.

Stopping condition reached: all requested round-1 findings adjudicated; Task 5 scoped gate passes. No fixes or deployment performed by the reviewer.
