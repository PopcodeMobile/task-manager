## Spec Compliance

**Needs fixes.** Task-scoped review of BASE `2dbd14e6b3cbd77e4408a4d6f723e7dff3f94670` to HEAD `390b209d583460da5859ce480d862cf3ace74ae2`. One Important gap in the new static token guard (I1). The entry cutover, retained shared modules, explicit SDK cutover proof, discussion reuse, backend formatting, frontend gates and evidence boundaries otherwise meet the reviewed 6d requirements.

**Scope:** exact 6d brief/handoff/token preflight and authoritative design; Rulings 10–13 assessed on their merits. This is not the later whole-branch review or Task7 activation approval. No context-manager capability was available; supplied task artifacts and applicable global AGENTS supplied the review context. No subagents, product changes, Git mutations, services or broad test reruns.

## Strengths and verified checks

- **Single final entry and explicit serving modes.** `index.html:14` boots React; `src/app/App.tsx:121` admits authenticated root/index; `vite.config.js:7` removes the temporary MPA/plugin setup and splits actual vendor imports; `vercel.json:7` targets `/index.html`. `tests/browser/cutover.spec.ts:3` asserts document response, query retention and reload for callback/consent/deep links, and local continuation. `tests/browser/app.spec.js:13` covers 21 named routes, fallback and eight tabs in PT/EN. The project/404 exclusion is explicit at `src/app/shell/WorkspacePanel.tsx:697`.
- **Visible business intent survives test migration.** `tests/browser/app.spec.js:59`, `:73`, `:91`, `:105` exercise create/reload/literal title, workspace isolation, saved rich description and actual reaction author DOM. `tests/browser/team-security.spec.js:19` and `:64` exercise stored team/profile/file markup through supported UI. Current focus/default-tab/palette readiness changes preserve keyboard actions and dirty-back behavior (`tests/browser/local-panel.spec.ts:1232`, `:2107`), rather than replacing them with renderer internals.
- **Strict rich text is reused without expanding policy.** The changed description/discussion consumers use the unchanged `src/core/rich-text.js:4` allowlist, including disabled data/ARIA attributes. Visible save/reload proof exists at `tests/browser/app.spec.js:91` and the passing preview log `docs/verification/agent-platform/task-6d-evidence/task6d-browser-preview-local.log:8`.
- **Normalized SDK and old-writer proof are distinct.** `tests/workspace-sdk.test.js:43` uses real normal Auth sessions for joins, two tenants, CAS, team membership, workspace metadata and a guest whose Auth metadata claims owner. `:99` explicitly migrates a legacy snapshot, rejects the old RPC/v1 bypass, repeats migration after a normalized write and compares preserved snapshot/revision. `:8` confines fixtures to loopback and `:34` cleans created clients/workspaces/users. The final aggregate log includes both tests without skipping.
- **Discussion reuse is bounded and fresh on retry.** `src/app/tasks/task-discussion-data.ts:3` documents complete arrays versus undefined; `:5` scopes comments/history by task and reactions by returned comments. The only actual `TaskDrawer` instance receives `shown` (`src/app/shell/WorkspacePanel.tsx:740`). Focused call-site inspection confirmed that `useWorkspaceData.ts:125` collects exhaustive `list(..., true)` reads, `:179` publishes them only after the complete Promise.all, and `:205` advances the revision. Existing event and command paths preserve invalidation/hydration ordering (`:238`, `:281`). The changed hook retains cancellation and revision dependencies, and forces fresh reads after explicit retry (`:367`, `:389`). Unit tests cover complete-empty/partial/fresh retry; actual browser evidence retains the 102-task case and 240-unit budget, with 122 successful detail reads and no 429 (`task6d-browser-agent-focused.log:18`).
- **Retirement and provenance are explicit.** The supplied diff deletes renderer-only groups while preserving shared calendar/local/data/i18n/sanitizer/token modules. The archived controller/config are DI-only/pure, outside the application closure. `task6d-import-closure.json:1` records 98 reachable modules, no missing or forbidden imports; its parser method is preserved at `methods.md:57`. All available archived report/review/inventory/Hermes records were compared to their scratch originals: content matches after whitespace normalization. `final-rulings-source.md` matches, including the withdrawn private-http proposal and superseding ruling. Prior task reviews were retained as historical records, not regraded as 6d implementation.
- **Frontend checks cover the intended scope.** `package.json:17` and `.github/workflows/ci.yml:20` add explicit typecheck; `eslint.config.js:10` and `tsconfig.json:22` include frontend TS/browser TS. `task6d-check-final.log:242` records 212 tests, 212 passed, zero failures/skips; `:254` records 234 public tokens/99 files. Shared JS is correctly not claimed universally typechecked. The passing guard does not close I1.
- **Backend formatting and diagnostics stay bounded.** The 15 approved files correspond to the recorded parsed AST comparison (`task6d-backend-equivalence-final.log:1`); the preserved method retains operator/literal/child structure and only unwraps parentheses (`methods.md:28`). The examined formatting hunks do not change backend contracts. `supabase/tests/webhook-recovery.mjs:37` adds phase/session/count/elapsed diagnostics; the catch selects state/wait/blocker metadata rather than SQL, payloads or credentials. Existing 8-second timeout remains. Its immediate rejection observer does not replace the later assertion of the original promise.
- **Validation evidence is real and bounded.** The supported Deno check lists production/test entries (`task6d-deno-check-supported.log:1`); live output is 28 passed/one TLS ignore (`task6d-deno-live.log:51`), separately closed by two passing TLS cases (`task6d-tls.log:6`). Actual Edge output records auth denials and pinned HTTPS peer/405, explicitly not Hermes acceptance (`task6d-edge.log:1`). PostgreSQL outputs end with real migration/concurrency and 008 serialization passes (`task6d-postgres.log:496`, `task6d-team-postgres.log:161`). The expanded original-path fixture check remains a separately identified 11-diagnostic failure, not an all-source typecheck claim.
- **Browser accounting is accurate.** Read the retained JSON results for every run named by `task6d-browser-summary.json`: all 114 case/mode mappings match their stated file, full nested title and latest outcome. Verified initial local 65 pass/2 fail, later local 21 pass/1 fail plus focused closure, initial agent 11 pass/14 fail plus 18-case closure; latest union is 67 local-dev, 25 agent-dev, 6 OAuth-dev, 7 local-preview, 3 cloud-preview, 6 OAuth-preview. No claim of one fresh all-green aggregate is made (`task-6d-report.md:117`). No browser execution was repeated.
- **Build and secret claims have limited evidence.** Cloud/local logs show actual three-way chunks, cloud main 480.63 kB and local main 477.19 kB, without the previous >500 kB warning (`task6d-build-cloud.log:10`, `task6d-build-local.log:10`). Scan artifacts record two known private candidates, zero literal build matches and 323 source/evidence files with zero reported issues; they are not an exhaustive security certification. Two retained screenshots were opened: mobile dark catalogue with visible focus and desktop cloud project overview with literal content/eight tabs. This is a spot inspection of preserved visual evidence, not a new browser or full visual audit.

## Issues

### Critical

None found in the reviewed 6d changes.

### Important

**I1 — Fully static local values bypass the token guard when expressed as templates or computed const keys.** `scripts/token-react.mjs:158` inspects only template literal chunks and discards interpolated expressions, even when they resolve to local constants. `scripts/token-react.mjs:11` resolves computed string literals but not a computed key that is a local string constant. The existing binding resolver at `:98` is therefore not used for these static forms. The three examples below all return no failures, although they have the same fixed padding/utility value as a rejected direct literal:

```tsx
const pad = 12;
export const Probe = () => <div style={{ padding: `${pad}px` }} />;

const pad = 4;
export const Probe = () => <div className={`p-${pad}`} />;

const key = 'padding';
export const Probe = () => <div style={{ [key]: 12 }} />;
```

This is within the requested static local-constant/style/utility/computed coverage, not a request to evaluate arbitrary imported/generated/runtime expressions. A routine refactor from a direct literal to a local const silently disables the CI guarantee. Resolve provably static local template values and computed property names before applying the existing policy; retain unknown/dynamic values as unknown and preserve allowed geometry/domain-color behavior. Add focused regression cases for all three examples plus genuinely dynamic controls. `tests/tokens.test.mjs:91`, `:111`, `:175` currently cover direct binding/literal computed keys but miss these combinations.

**Focused probe executed (read-only, no fixture file):**

```sh
node --input-type=module <<'JS'
import { auditReactSource } from './scripts/token-react.mjs';
const cases = {
  direct: 'export const Probe = () => <div style={{ padding: 12 }} />',
  templateConst: 'const pad = 12; export const Probe = () => <div style={{ padding: `${pad}px` }} />',
  templateClass: 'const pad = 4; export const Probe = () => <div className={`p-${pad}`} />',
  computedConst: 'const key = "padding"; export const Probe = () => <div style={{ [key]: 12 }} />',
};
for (const [name, source] of Object.entries(cases))
  console.log(JSON.stringify({ name, faults: auditReactSource('src/probe.tsx', source, new Set()) }));
JS
```

```json
{"name":"direct","faults":["src/probe.tsx:1:51: fixed padding: padding: 12"]}
{"name":"templateConst","faults":[]}
{"name":"templateClass","faults":[]}
{"name":"computedConst","faults":[]}
```

### Minor

**M1 — The aggregate output contains an unacknowledged output-directory warning.** `docs/verification/agent-platform/task-6d-evidence/task6d-check-final.log:261` says `/tmp/task6d-check-final-build` is outside the project and will not be emptied. The report records the successful build but does not identify this warning. It is not the earlier bundle-size warning, and the separately preserved clean local/cloud builds provide the relevant exact-artifact proof. Record this residual explicitly and use an explicitly empty owned output directory for future aggregate evidence so stale files cannot make the build directory misleading. No rerun is necessary solely to erase historical warning output.

## Cannot verify from this task diff

- Entire unchanged backend authorization/data-migration architecture, exhaustive parity of earlier 6a–6c behavior, and all historical task acceptance require their separately reviewed gates. The final matrix supports their scoped regression claims; this review does not replace the final whole-branch review.
- Hosted frontend/Vercel responses, production Auth URLs/CORS, public DNS/TLS/Hermes route and effects, actual production Hermes, two actual Claude users, and activation readiness are unverified here. `task-6d-report.md:134`, `docs/verification.md:22` and the retained hosted/Hermes records state these boundaries accurately. Hosted API/MCP through008 uses actual transport with synthetic principals; isolated pinned Hermes 5/5 uses synthetic provider/home. Cron remains disabled according to the preserved record, not a new live inspection.
- The expanded original-path Edge fixture typecheck did not pass (`task6d-deno-check.log:93`); supported Deno/runtime checks must not be generalized to all fixtures. Historical webhook-barrier causation remains unproven; this passing aggregate establishes non-recurrence in that run only.
- Coverage >80%, complexity <10, universal absence of vulnerabilities/secrets, exhaustive accessibility, and overall production performance are not established by these artifacts and are not asserted.

## Review method and stop condition

- Read the supplied net diff in grouped passes: changed frontend/config/tooling/tests, format-only backend, retirement boundaries, and retained documentation/evidence. No regenerated Git diff or historical task re-review.
- Focused outside-hunk reads were required for two named risks: discussion completeness/invalidation/cancellation (full cut-off `useTaskDetails`, parent refresh and actual `TaskDrawer` call sites) and sanitizer-policy equivalence (unchanged `src/core/rich-text.js`). Archive originals and private browser JSON were read only to verify provenance/counts; no credential/network payloads were printed.
- Existing test/build/Deno/PostgreSQL results were inspected, not rerun. The only new execution was the small static token probe above. No product/source/index/HEAD mutation; only this report was written.

## Assessment

**Task quality: Needs fixes.** I1 prevents approval of the promised static token CI gate. The other reviewed 6d changes are cohesive, preserve the data/security/runtime boundaries, and carry substantial behavioral evidence with honest remaining activation limits. Close I1 with focused guard regressions and accurately record M1; then request a bounded rereview of the fix. Stop condition reached: complete task-scoped review/report delivered; no push, merge or activation.
