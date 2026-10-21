# Task 6b3 independent re-review — round 1

Date: 2026-10-20. Base `770575c9a86af5e02ba410e69f290b6063642e2a`; head `00ed15afa68698391ba1cf17404dd28e175d0a6d`.

## Verdict

**Spec: PASS. Quality: PASS. I1: addressed.** Zero new findings in this two-file correction. The original scoped review's sole finding is closed; this permits the Task 6b3 scoped gate to pass, without completing the wider migration or resolving inherited 6d validation concerns.

## Fix assessment

`ScheduleView.tsx:154–157` captures the direct calendar event opener, while lines 254–258 capture the day-overflow button. Opening an event inside overflow retains that connected calendar button rather than replacing it with the inner button removed by the content transition.

The explicit `onCloseAutoFocus` at lines 317–321 prevents Radix's null-trigger path, clears the stored reference and restores focus only when the opener remains connected and the captured repository signal is active. Ordinary Escape and close-button dismissal use this path.

Task navigation clears the reference and both panel states before invoking the destination callback (lines 73–77), including the shared task context-menu open callback at line 302. Project navigation likewise clears them (lines 338–342). Therefore closing the calendar sheet during navigation does not attempt to focus the previous calendar button over the destination.

Changes remain confined to this focus behavior and meaningful regression tests. No API, metadata, date arithmetic, drag/CAS, capability or persistence code changed. No regression attributable to the fix was identified.

## Evidence inspected

- Read the appended fix report and exact `review-770575c..00ed15a.diff`; verified its changed lines and blob IDs match the two exact commits (artifact uses wider unchanged context). HEAD matches the review head. Root plan/spec changes remain excluded.
- `/tmp/task6b3-fix1-red-raw.log`: all three new cases failed at `toBeFocused()` after dismissal, with the direct event or overflow opener inactive. This directly reproduces I1 before the fix.
- `/tmp/task6b3-fix1-green-raw.log`: **5 passed in 6.5s**, comprising the three new focus cases and two affected existing calendar/schedule flows. The new tests exercise direct event, day overflow and overflow-to-event opening by keyboard; each covers both Escape and keyboard activation of Close panel, with explicit opener-focus assertions.
- The overflow test also asserts the destination task drawer Title input is focused after opening its task. The nested-event project test asserts the correct project task route and absence of the old sheet. It does **not** assert a particular destination project element has focus; no stronger browser focus claim is made for that path. Source inspection confirms restoration suppression there.
- Read `/tmp/task6b3-fix1-typecheck.log`, `-lint.log`, `-format-check.log` and `-diff-check.log`: no type/lint diagnostics, scoped Prettier success and empty diff-check output, consistent with the reported exit-zero checks.

## Limits and stop condition

No suites or browser servers were rerun during this review; the supplied raw executions and changed source were examined independently. No cloud/backend/build rerun is claimed for this focused shared UI correction. Previous Task 6b3 cloud, date/drag, file and MCP proof retains its original bounds, including possible cancellation of native drag on source unmount. The inherited broad SQL-barrier validation concern, final formatter/token coverage and 6d cutover work remain open.

Only this report was written. No product, shared runtime, database or hosted changes were made. Stop after this scoped verdict.
