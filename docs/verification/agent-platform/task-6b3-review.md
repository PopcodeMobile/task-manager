# Task 6b3 independent scoped review

Date: 2026-10-20. Base `f1bf6030a357418434aad7ca5e0c1ab1985da39e`; head `770575c9a86af5e02ba410e69f290b6063642e2a`.

## Verdict

Spec: **CHANGES REQUESTED**, narrowly for keyboard focus restoration below. Quality: **CHANGES REQUESTED**. One distinct finding: **1 P2**, no P0/P1 findings. The same finding affects both axes; it is not two separate defects.

The requested schedule/file workflows otherwise appear implemented within the approved scope. Prior reviewed backend 4b is baseline, not reconsidered here. This is not a whole-branch, migration-completion, or production-activation verdict.

## Finding I1 — P2: Restore focus when closing calendar event/overflow panels

Location: `src/app/schedules/ScheduleView.tsx:301` (openers at lines 150 and 246).

The event and overflow buttons open a controlled `Sheet` by setting state, but no Radix `Dialog.Trigger` is mounted and `SheetContent` has no `onCloseAutoFocus`. Closing an event or day-overflow panel with Escape/the close button therefore does not return keyboard focus to the calendar opener. This loses the user's calendar position and makes continuing through nearby days/events difficult, particularly with the many day controls and overflow items.

This is supported directly by the installed implementation: `src/components/ui/sheet.tsx` passes its props to Radix Content, and `node_modules/@radix-ui/react-dialog/dist/index.mjs:174` unconditionally prevents default close autofocus and then calls only `context.triggerRef.current?.focus()`. With no Trigger that ref is null. The focus-scope fallback to the previously focused element is skipped when this event is prevented (`react-focus-scope/dist/index.mjs:110–115`). Unlike the new FilesView sheet, this calendar sheet does not provide its own restoration handler. The existing calendar browser test presses Escape but never asserts the resulting focus.

Fix: capture the calendar opener and explicitly restore it on ordinary dismissal (or use a properly wired dialog trigger). Preserve a connected calendar fallback for the overflow-to-event transition, whose event button is removed when the sheet switches content. Do not steal focus from a task drawer/project opened from the sheet.

Focused acceptance: keyboard-open a direct event and a `+N more` panel, Escape/close each, and assert the original button is focused. Also open an event from overflow, dismiss it, and assert focus returns to the calendar overflow button rather than a removed sheet element. These assertions should accompany the fix. No browser was started during this review; the finding is source-backed, not claimed as a newly executed browser reproduction.

Spec basis: task-6b3 brief requires keyboard verification; common task-6 handoff requires focus verification. The inventory requires event-detail and day-overflow interactions, so their keyboard dismissal belongs to this slice.

## Scope and evidence examined

- Read the exact review handoff, 6b3 brief/handoff/report, common task-6 handoff, and route inventory rows 11/12 plus project calendar/timeline/files rows. Reviewed all 15 changed files, focused surrounding legacy/repository/primitive code, and the shared component contracts.
- Confirmed HEAD and single scoped commit. Compared artifact changed lines/blob IDs with the exact Git diff: match. The artifact contains wider unchanged context. Root-owned dirty plan/spec are outside this artifact.
- Inspected raw local final logs: five relevant browser tests pass in 8.4s. Inspected final cloud log: one actual cloud schedule/file flow passes in 4.9s, with 101 successful read RPCs, four member RPCs, six execute RPCs, and deliberate first duplicate-response abortion.
- Inspected the earlier cloud combined log: four refresh/MCP regressions passed and the first new-flow run timed out. The final source adds explicit drawer readiness assertions and the supplied focused rerun passes. This is not represented as an uninterrupted all-green run.
- Inspected focused Node log: 68 tests pass, zero failures/skips. Read relevant tests for DST, captured CAS, actual local adapter conflict/disposal, file unlink composition/batch bound, cursor continuation, unknown metadata, duplicates and persisted mutations.
- Inspected typecheck/lint/format/token/build raw outputs: no type/lint diagnostics, scoped formatting pass, 234-token/109-source audit pass, both builds exit zero, environment unchanged and zero literal private-candidate matches. These are supplied tool results, not reviewer reruns. No numeric coverage percentage, complexity threshold, comprehensive dependency audit or exhaustive performance benchmark is established by this evidence.
- Viewed the supplied dark timeline, PT mobile calendar and cloud mobile file screenshots. They support contained schedule overflow, theme/localization and literal metadata display; screenshots alone do not prove keyboard restoration.

## Preserved contracts / evidence limits

The optional project scope, local date arithmetic/duration, event time with seconds, complete cursor reads, metadata-only selection, literal rendering, stable duplicate IDs, source CAS, explicit atomic unlink-before-delete and parent reservation checks are present. Global metadata and embedded ownership are delegated to the reviewed canonical adapter; unknown metadata is not reconstructed in the UI. Legacy source has no folder workflow, so omitting invented folders is appropriate.

Shared snapshot changes capture the event boundary before mutable hydration, refresh files for task moves, refresh affected collections from successful operations/batch children and actual events, and retain empty-event polling without a graph reload. Supplied actual OAuth/MCP-to-open-drawer regression proof remains valid within its test scope.

The native same-ID workspace-switch test proves dragstart followed by unchanged destination data/revision; unmount may cancel delivery. It does not prove an old-nonce drop handler ran. Separate helper scope rejection and actual local adapter stale-CAS/disposal checks supply the additional evidence; no stronger native delivery claim is made.

The known broad SQL-barrier timeout and remaining 6d formatter/token/cutover validation remain unresolved baseline follow-through. No broad suites, browser servers, shared database, hosted runtime or product edits were run/made during this review. Only this report was written. Stop here for the scoped correction and independent recheck.
