# Finding Verdicts

- **R1 — UTC dates change Today/Overdue before the user's day ends — ADDRESSED.** `src/app/tasks/task-view-model.ts:47` now calculates day differences through local-calendar `parse/diffD`; `src/app/tasks/TaskViews.tsx:652` uses `iso(addD(new Date(), offset))` for contextual creation. `src/core/calendar.js:3`, `:8`, `:12`, `:17`, `:22` preserve the legacy local-day operations, including calendar addition across DST. `tests/task-views.test.mjs:145` covers Maceio 22:30 and New York DST; `tests/browser/local-panel.spec.ts:573` proves actual local creation, storage, group placement, reload and drawer deadline at the reported failing instant.
- **R2 — Next 7 days and Overdue filters changed legacy semantics — ADDRESSED.** `src/app/tasks/task-view-model.ts:52` separates `matchesDue` from exclusive grouping. The predicate includes days 0–7 for Week and requires unfinished status for Overdue; negation still applies to the complete predicate. `tests/task-views.test.mjs:165` covers Today, +7, +8, open overdue, completed overdue and no date with both `is` and `not`.
- **R3 — Preference-load errors hidden behind endless loading — ADDRESSED.** `src/app/tasks/TaskViews.tsx:65` adds explicit failure/attempt state; initialization checks both mounted lifetime and abort before publishing failure. `:261` renders a fixed translated alert and Try again before returning Loading. Retry reloads through the same read path without resetting storage. `tests/browser/local-panel.spec.ts:602` checks exact safe alert text, repeated failure, byte preservation, explicit recovery, restored query and retention of unknown metadata after another edit.
- **Authorized R1a — Composer displays a project but submits an empty default — ADDRESSED.** `src/app/tasks/TaskViews.tsx:652` derives the effective project from nonempty fixed scope, a still-valid explicit selection or the current first project. Both the select and submission use that value; unavailable fixed projects block submission. `tests/browser/local-panel.spec.ts:638` creates without changing the hydrated default, then explicitly selects another project and verifies real stored project IDs and retained selection.

# New Breakage in the Fix Diff

- None found. The six-file diff stays within the original findings and authorized composer correction. `src/core/utils.js:1` imports required local bindings and `:19` transparently reexports all six extracted helpers; `TODAY` and `dOff` remain in the legacy module. The removed definitions and new definitions match in the supplied diff. The extraction avoids pulling legacy font/locale side effects into the React view model.

# Out-of-Scope Observations

- None. Unchanged task actions, backend/auth/adapter contracts, graph/detail work and future route/cutover tasks were not re-reviewed.

# Evidence Checked

- Read the original brief and findings, appended fix-round report and complete 522-line package `review-9008478..49e9a03.diff` in consecutive chunks 1–300 and 301–522, without truncation. Fix base `90084780bb880bacc3cfbca09b85d271b227933a`; head `49e9a03cf6773fcb241e30ef0b22912253be7fea`.
- `node --test tests/task-views.test.mjs`: `/tmp/task6b1-review-final-model.log` contains 11 pass, 0 fail, 0 skip, including the original eight cases, local-calendar/DST coverage, overlapping filters/negation and legacy export reference equivalence. Inspected `/tmp/task6b1-r1-r2-red.log`: both original date defects fail before the fix.
- `npx playwright test --config playwright.local.config.ts -g 'Today composer|hydrated default project' --output /tmp/task6b1-review-composer-green-results`: `/tmp/task6b1-review-composer-green.log` contains 2/2 pass, 3.5s. `/tmp/task6b1-r1-composer-red.log` records successful creation with October 21 instead of October 20 before the fix; `/tmp/task6b1-r1a-red.log` records failed default-project creation. The earlier composer preparation failure is not treated as timezone RED.
- `npx playwright test --config playwright.local.config.ts -g 'failed task view preferences' --output /tmp/task6b1-r3-final-results`: `/tmp/task6b1-r3-final.log` contains 1/1 pass, 2.0s. The corresponding initial missing-alert failure is recorded in `/tmp/task6b1-review-red.log`. The final test checks exact safe text and storage bytes, not only the presence of any alert.
- Inspected `/tmp/task6b1-review-final-types.log`, `/tmp/task6b1-review-final-lint.log`, `/tmp/task6b1-review-final-format.log`, `/tmp/task6b1-review-final-diff.log`: no failure/warning output; scoped formatting reports all matched files conform. These support the report's typecheck/lint/format/diff checks. The six unchanged helper bodies are directly visible in the fix diff; the report also records its inline comparison result. No separate body-comparison log path was claimed.
- One focused unchanged-source check: `rg -n '\bDAY\b' src/core/utils.js` returned only the reexport at line 19. Named risk: moving `DAY` to a reexport could leave a downstream local reference unbound. No such reference remains. No broader caller crawl was needed because helper definitions and exported bindings are preserved.
- No test, browser or build rerun and no additional behavioral probe: existing targeted runs answer the reported defects. Prior broad/cloud-102/OAuth/build evidence remains prior evidence, not a new final-round run. No git command, source/index/HEAD/branch mutation or subagent; only this report was written.

# Verdict

- **Spec compliance: Approved for Task 6b1 and this fix scope.** R1, R2, R3 and authorized R1a are addressed.
- **Code quality: Approved.** The fixes preserve existing helper/API behavior, provide explicit non-destructive recovery and have focused behavioral coverage.
- **Fix round: All findings addressed, no new Critical/Important breakage.** No findings remain open from the original Task 6b1 review. This does not substitute for the later whole-branch/cutover review.
