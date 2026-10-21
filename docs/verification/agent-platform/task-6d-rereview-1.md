**I1 — Static templates/computed const keys bypass the token guard — ADDRESSED.** `scripts/token-react.mjs:106` resolves local const strings/numbers, signed numeric aliases and nested templates with cycle detection; computed keys use that resolver, and `:190` reconstructs known template parts before policy checks. `tests/tokens.test.mjs:187` covers all three exact reported bypasses; `:198` covers nested templates and computed `cn` keys. Retained RED output shows the original misses, and `task6d-fix1-unit.log:13` records their passing rejection assertions. A separate regression introduced by this resolution is N1 below.

**M1 — Unacknowledged external output-directory warning — ADDRESSED.** `docs/verification/agent-platform/task-6d-report.md:152` acknowledges the actual warning and distinguishes aggregate completion from the clean local/cloud artifact evidence. `task-6d-evidence/methods.md:189` prescribes a fresh owned temporary directory for future aggregates and explicit `--emptyOutDir` for the separate owned build; it correctly avoids a global setting on arbitrary paths. No cosmetic aggregate/build rerun is claimed.

## New Breakage in the Fix Diff

**Important N1 — Static resolution falls through local shadowing declarations and rejects dynamic values as outer constants.** `scripts/token-react.mjs:86` collects only plain identifier declarations that have initializers. A destructured local binding or an uninitialized local `let` is therefore absent from the lexical lookup. The new `staticValue` path at `:112`, used by templates at `:190`, falls through that missing local binding to a same-named outer const. The added parameter-shadowing check at `:102` does not cover these ordinary local declarations.

These valid component examples returned no failures at BASE and are now falsely rejected:

```tsx
const color = '#123456';
export const Probe = props => {
  const { color } = props;
  return <div style={{ color: `${color}` }} />;
};

const pad = 12;
export const Probe = props => {
  let pad;
  pad = props.pad;
  return <div style={{ padding: `${pad}px` }} />;
};
```

The runtime values in these examples are unknown to the auditor; neither equals the outer const by lexical semantics. This violates the fix's stated bounded-static/unknown-value contract and makes normal dynamic authoring fail the CI token gate. The color case can represent a validated domain value passed by a caller. This is a demonstrated newly introduced false positive, not a request to interpret arbitrary runtime JavaScript or a new application review.

**Required correction:** register every local binding as a lexical shadowing boundary, including destructuring and declarations without initializers. Resolve only an eligible initialized local const; stop lookup at an ineligible/unknown nearest binding rather than searching an outer scope. Retain the positive static resolution and add focused controls for both examples, including a renamed destructuring binding.

**Focused read-only probe executed:**

```sh
node --input-type=module <<'JS'
import { auditReactSource } from './scripts/token-react.mjs';
const cases = {
  destructuredLocal: 'const color = "#123456"; export const Probe = props => { const { color } = props; return <div style={{ color: `${color}` }} />; };',
  uninitializedLocal: 'const pad = 12; export const Probe = props => { let pad; pad = props.pad; return <div style={{ padding: `${pad}px` }} />; };',
  parameterControl: 'const color = "#123456"; export const Probe = ({ color }) => <div style={{ color: `${color}` }} />;',
};
for (const [name, source] of Object.entries(cases))
  console.log(JSON.stringify({ name, faults: auditReactSource('src/probe.tsx', source, new Set()) }));
JS
```

```json
{"name":"destructuredLocal","faults":["src/probe.tsx:1:111: fixed color: color: #123456"]}
{"name":"uninitializedLocal","faults":["src/probe.tsx:1:105: fixed padding: padding: 12px"]}
{"name":"parameterControl","faults":[]}
```

**Before/after check:** reconstructed the complete BASE auditor from its new-file section in the original supplied review package, imported it in memory, and ran only the same two fixtures. No Git command, source file edit or test suite was used. Output:

```json
{"name":"destructuredLocal","before":[],"after":["src/probe.tsx:1:111: fixed color: color: #123456"]}
{"name":"uninitializedLocal","before":[],"after":["src/probe.tsx:1:105: fixed padding: padding: 12px"]}
```

## Checks and Evidence

- Scoped review BASE `390b209d583460da5859ce480d862cf3ace74ae2` → HEAD `de11cc23b628c0b196954baee5719b87b6038590`; supplied fix package, initial findings and fix append read. Runtime/backend/browser/dependency/quota sources are absent from the fix diff.
- `tests/tokens.test.mjs:209` exercises token templates, imports/generated values, cycles, geometry and domain colors; `:223` exercises mutable interpolations, parameter shadowing and mixed known/unknown classes. These tests have meaningful positive/negative assertions, but do not cover the local-declaration shadowing in N1.
- `task6d-fix1-unit.log:19` records 18 tests/18 passed/zero failures/skips; `task6d-fix1-audit.log:5` records 234 tokens/99 sources. Lint and owned formatting output are retained. `task6d-fix1-scans.json:1` records a bounded two-candidate/335-file scan with zero issues and no debug matches. These passing commands were not rerun.
- `docs/verification.md:7` and `task-6d-report.md:154` accurately keep the prior 212-test aggregate and 114 browser case/mode outcomes historical for unchanged runtime sources; the new tooling checks are not presented as a fresh aggregate/browser run.
- No subagents, browsers, services, product/index/HEAD mutations, or broad suites. Only this rereview report was written.

## Out-of-Scope Observations

None. Previous whole-branch and activation proof boundaries remain unchanged.

## Verdict

**Fix round: Findings remain open — N1.** I1 and M1 are addressed; the new lexical-resolution regression is Important. **Spec compliance and task quality: Needs fixes** until the auditor respects unknown local shadowing bindings. Stop condition reached for this scoped rereview.
