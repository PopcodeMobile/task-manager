# Independent final rendered review

**Current decision after final10: PASS for the finite material findings R01–R11 within the documented capture/data/capability boundaries. R02 is now closed from fresh actual images. This is not an absolute pixel-identity or functional PASS.**

## Evidence and coverage

Visually reinspected **all 196 base pairs and all 102 extra-state pairs**, matched by key, against the pinned original. Authoritative evidence:

- Base: `/tmp/task-manager-design-reference` versus immutable `/tmp/task-manager-design-candidate-final8`.
- Extras: `/tmp/task-manager-design-extra-reference` versus immutable `/tmp/task-manager-design-extra-candidate-final8`.
- Source freeze identity: `/tmp/task-manager-design-final-source.json` (125 source entries; parent reports unchanged before/after capture).
- Private unmasked paired contact sheets and full-resolution follow-ups: `/tmp/design-parity-review-final8`, original left/candidate right. Original PNGs were not modified.

Independently read both manifests: base196/reference196 and extra102/reference102, every key unique, no unmatched keys, no capture/page errors. The capture contract is upstream `904205c626918ee96054eb35495c394a60c0c601`, matching synthetic fixture, fixed time `2026-10-21T08:30:00Z`, EN, browser, dark/light, desktop1440×1000/mobile390×844. Pixel diagnostics in `/tmp/task-manager-design-comparison-final8` provide no acceptance tolerance and were not used to waive visible differences.

Coverage includes all49 base routes in all4 theme/viewport combinations, all21 Settings subsections, all8 project tabs, and all26 desktop/25 mobile extra states in both themes. Extra states cover project list/table, task board/table, month→week, create/edit/save/share dialogs, task drawer/expanded and field/tool popovers, file preview/options, and Inbox conversation. Full-resolution follow-up covered schedule mobile, mobile cards, expanded/drawer task, due popup and conversation. This is supplied viewport/state coverage, not an absolute assertion about invisible scroll positions or every possible interaction.

No product source edits, browser operations, builds, tests, network, credentials or actual user applications were used by this reviewer. Parent's functional checks are separate evidence, not a substitute for rendered comparison.

## Closure matrix for R01–R11

| ID                                            | Final8 assessment and actual evidence                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 mobile project header                     | **Closed.** `dark-mobile-project-overview`: original/candidate h1 x64/y70.22/w158.34/h27.55; tabs y152/h37; first panel x16/y211/w358/h131.17. The previous20px displacement is gone across project tabs/themes.                                                                                                                                  |
| R02 mobile task density and schedule controls | **Closed through final9/final10 supplements.** Final8 restored Overdue, exact List/My Tasks card dimensions and task toolbar packing. Final9 restored Timeline controls and exact82.953125px Table cards. Final10 closes the remaining Calendar overlap/day-add structure. Historical findings below are superseded by those fresh-image results. |
| R03 month event times                         | **Closed.** Both workspace/project mobile month views display the compact original event times again (`15:00`, `10:00`, `09:30`, etc.).                                                                                                                                                                                                           |
| R04 urgency hierarchy                         | **Closed.** `project-overview` restores red overdue badge/Yesterday and amber Today/Tomorrow; My Tasks overdue date is red. Checked desktop/mobile and both themes.                                                                                                                                                                               |
| R05 activity flow/compact Overview history    | **Closed for material presentation.** Event actor/verb/title flows inline again; Overview Recent activity uses compact rows without a full TODAY group. Valid retained history/order remains a data boundary; records should not be hidden to reproduce the legacy history selection.                                                             |
| R06 Theme/Language selection                  | **Closed independently from new renders.** Dark captures select Dark, light captures select Light; Settings Language selects English (US) in both themes/viewports. No stale Light/Português selection remains.                                                                                                                                   |
| R07 Inbox read controls                       | **Closed.** Heading and trailing read-action glyphs are legible at their normal size; Notifications date headings use uppercase hierarchy.                                                                                                                                                                                                        |
| R08 Reply composer                            | **Closed for material composition.** Both themes restore the compact bordered composer aligned with conversation content, hint and right Reply action. Former32px indentation/45px extra height and native resize handle are gone.                                                                                                                |
| R09 Projects Table                            | **Closed.** Mobile project names wrap and Project/Status/Lead fit inside390px. All seven compact rows are visible; desktop names fit appropriately.                                                                                                                                                                                               |
| R10 task modal placement/density              | **Closed.** Expanded modal is centered at x230/w980 instead of x72; primary Description/Subtasks/Attachments/Comments order and compact spacing are restored, with composer/action within1000px. Mobile Comments tabs again reach the844px viewport boundary. New task actions remain after original content.                                     |
| R11 Filter/Due popovers                       | **Closed.** Desktop Filter restores its wide arrangement and two rows of filter chips while retaining additional selection controls. Mobile Due restores322px width, all four quick dates on its first row and Clear below.                                                                                                                       |

Previous major V01–V12/E01–E04 fixes remain intact in the full matrix: responsive task metadata cards, human-readable semantic labels, viewport-filling calendars, compact desktop schedule toolbar, Files preview column, aligned Overview Details, stacked mobile Settings/theme/plan controls, create/edit/save-view bottom sheets and compact sharing rows. No new material issue was found in the remaining final8 base/extra images.

## Sole remaining group: R02 · P1 · Mobile schedule toolbar and Table card density

**Owner:** Task3, `src/app/schedules/ScheduleView.tsx`, `schedules.css`, shared task toolbar/table styles. Exact affected cases apply in both dark/light.

**Schedule controls:** base `dark-mobile-timeline`, `light-mobile-timeline`, `dark-mobile-project-timeline`, `light-mobile-project-timeline` lose Manual sort and the entire Weeks/Months/Group/Today row. Project Timeline also loses its New task control. Workspace month header starts y176 rather than original y207, a31px upward shift resulting from missing controls. Base `dark-mobile-calendar`/`light-mobile-calendar` and project-calendar wrap Manual below the search row, visibly colliding with the Today/month controls. Extra `*-mobile-calendar-week` and `*-mobile-project-calendar-week` show the same collision and omit the original day-header add affordance. This is a concrete missing/overlapping-control regression, not a request to redesign controls. Restore the original visible row packing and access to all original schedule actions.

**Table cards:** base `dark-mobile-project-table`/`light-mobile-project-table`, extra `dark-mobile-tasks-table`/`light-mobile-tasks-table`. Project Table now starts at exact original x16/y241/w358, but each original first card is h82.95 while candidate is h94. The extra11.05px per row compounds down the viewport: original exposes seven complete compact rows where candidate exposes roughly six and a half. Restore original compact Table card spacing while preserving task ID/status/priority/assignee/date/estimate and supported selection controls. List/My Tasks card heights already match and need no further adjustment.

Parent has assigned a narrow correction to this family. This report records immutable final8 evidence; a later fix is not accepted until its fresh pairs are inspected.

## Boundaries and completion condition

Canonical Files intentionally contains ten distinct authorized records where legacy exposes seven, because existing normalization unions global and embedded attachment IDs. Matching filenames do not justify deduplication or hiding records. Additional valid history, green/amber/custom accents, authorized new task actions and honest unavailable/local-service text remain allowed. No finding requests fabricated cloud billing, presence, authentication or real file uploads. Those boundaries prevent an absolute pixel-identity claim even after geometry acceptance.

The independent298-pair re-review is complete. **Acceptance is pending only fresh paired evidence closing R02's mobile schedule controls and Table density without regressions.** No full-parity PASS is issued for final8.

## Final9 bounded supplement

Independently inspected **32 fresh pairs** from immutable `/tmp/task-manager-design-candidate-final9` and `/tmp/task-manager-design-extra-candidate-final9` against the same pinned originals: workspace/project Calendar and Timeline, project Table, task Table, workspace/project Calendar week, dark/light × desktop/mobile. Paired unmasked sheets are in `/tmp/design-parity-review-final9`. The final9 manifests independently contain196/102 unique records with0 errors. This is a bounded re-review following the full298-pair final8 review above; it does not claim that all298 final9 images were re-inspected.

**Closed from actual final9 images:** Timeline Manual sort and Weeks/Months/Group/Today are visible again in both mobile families/themes, including project New task. Calendar Manual stays in the search/filter row. Project Table first panel now exactly matches original x16/y241/w358/**h82.953125**; workspace task Table density also visually matches. The final correction selectors read in `schedules.css` are inside `@media (max-width:640px)` and confined to the schedule view/tools/controls/navigation. Desktop schedule and Table pairs show no change attributable to the mobile fix. No unrelated final8 closure was reopened.

**Remaining finite R02, Calendar mobile only:**

1. `dark-mobile-project-calendar`, `light-mobile-project-calendar`, plus the corresponding project-calendar-week extras: New task begins at approximately x16/y227 and extends to y253 while Today begins around x16/y242, creating roughly11px of overlap. The original has a separate legacy collision on the right with Month/Week; reproducing that collision is not requested. Keep New task and Today/month controls fully visible and clear of one another in the original compact toolbar area.
2. `dark-mobile-calendar-week`, `light-mobile-calendar-week`, `dark-mobile-project-calendar-week`, `light-mobile-project-calendar-week`: original day headers expose a right-aligned `+` add action; candidate does not. Original Month/Week switches occupy a second navigation row in these week captures, while candidate compresses them onto the first, shifting the first day header upward. Restore the original visible week navigation/day-add structure with current authorized creation behavior. This was already part of R02, not a new general critique.

Only these Calendar controls remain pending fresh paired evidence. The separate initialization/lifecycle investigation and functional gates are outside this visual review; **no functional PASS is asserted**.

## Final10 bounded closure — PASS

Reopened only the eight requested Calendar mobile pairs, using immutable `/tmp/task-manager-design-candidate-final10` and `/tmp/task-manager-design-extra-candidate-final10` against the same original directories. Actual cases inspected, all at390×844:

- Base: `dark-mobile-calendar`, `light-mobile-calendar`, `dark-mobile-project-calendar`, `light-mobile-project-calendar`.
- Extras: `dark-mobile-calendar-week`, `light-mobile-calendar-week`, `dark-mobile-project-calendar-week`, `light-mobile-project-calendar-week`.

Unmasked paired PNG sheets are in `/tmp/design-parity-review-final10` (original left, candidate right). Independently confirmed candidate manifests contain196 base/102 extra unique records with0 capture/page errors. No claim is made that all298 final10 pairs were re-inspected: this closure combines the full298-pair final8 review,32-pair final9 scope review and these8 final10 pairs.

**R02 closure from rendering:** New task is right-aligned in its own compact project toolbar row and no longer overlaps Today or Month/Week. Today, previous/next, date label and Month/Week remain fully visible. Weekly views restore Month/Week on their second navigation row and a visible right-aligned `+` for each day header. Both themes show the same corrected structure. Workspace Calendar retains its compact heading/search/filter/sort/navigation layout. The project calendar navigation is approximately one toolbar row lower than the legacy image because the candidate clears the legacy New task/Month control collision; that explicit correction was requested in the final9 review. It is not a missing-control or density regression. No new material gap is visible in these eight pairs.

**Final visual decision: PASS for the finite material finding set R01–R11.** All previously recorded material blockers now have actual-image closure. Canonical Files10vs7, additional valid history, custom accents and truthful local/unavailable-capability wording remain the explicit boundaries above. This result covers the supplied routes, themes, viewports and states through the staged review; it does not assert absolute100% pixel identity, unseen scroll positions, every possible interaction or functional correctness. No product files, tests, builds or servers were changed by this reviewer.
