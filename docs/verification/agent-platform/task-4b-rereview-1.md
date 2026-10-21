# Task 4b independent re-review — fix round 1

Reviewed exact fix range: `75a47d9d822f32aa5213e6db14d9aa7dc68fac83..f1bf6030a357418434aad7ca5e0c1ab1985da39e`.

Artifact: `review-75a47d9..f1bf603.diff`. Read the appended fix-round report and all seven changed files. Scope is F1 and regressions introduced by this correction only; the original scoped review remains the baseline for metadata copying, ownership, actor/CAS/replay, tenant safety, private helpers and source/join integrity.

## Verdicts

- **Spec: PASS.** F1 is addressed under the root-approved ID contract.
- **Quality: PASS for the scoped correction.** No new actionable finding identified.
- **F1: CLOSED / addressed.** Original P2 count: 1; remaining open findings: **0**. No unrelated issue was added to the ledger.
- The task-4b code-review prerequisite is clear at `f1bf6030a357418434aad7ca5e0c1ab1985da39e`. Runtime application and endpoint proof remain separate root-owned steps; this is not a deployment-success claim.

## F1 verification

The accepted contract is an unchanged PostgreSQL-representable Unicode string, nonblank under JavaScript `trim()`, with at most 128 UTF-16 code units. Punctuation and leading characters are unrestricted. NUL and unpaired surrogates are rejected. Inputs are neither trimmed nor normalized.

| Surface                                                         | Reviewed implementation and result                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local, `src/workspace/local-panel.js:437`                       | A branch limited to `duplicate_file` and `id`/`newId` applies string type, nonblank trim, UTF-16 length, NUL and unpaired-surrogate checks, then bypasses the old ASCII-only ID pattern. Original `copy.v2` reproduction is included in accepted fixtures.                                                                                                               |
| Shared, `supabase/functions/_shared/validation.ts:165`          | Uses the same predicate for the same two fields and operation. Batch recursion reaches the predicate. Required fields, source expectedVersion and strict operation/input allowlists remain intact.                                                                                                                                                                       |
| SQL, `supabase/migrations/202610200006_file_duplication.sql:13` | Existing strict validation runs first. The added loop uses the explicit ECMAScript trim character set and adds one unit per astral code point to PostgreSQL character length. It therefore matches the UTF-16 bound. Existing character-length validation bounds the supplementary scan to at most 128 characters per ID. All other operations still delegate unchanged. |
| OpenAPI, `supabase/functions/api/openapi.json:8377`             | Both fields document unchanged Unicode, unrestricted punctuation/leading character, ECMAScript nonblank semantics, NUL/surrogate restrictions and the 128 UTF-16-unit bound. The schema's maxLength is an outer character bound; the stricter UTF-16 rule is explicitly documented. Batch inputs reference this same operation input schema.                             |

The JavaScript surrogate check has the Unicode regex flag, so valid surrogate pairs remain accepted while lone surrogates reject. SQL cannot receive NUL or lone surrogates as valid JSONB text; tests distinguish that decoding rejection from the ordinary RPC `validation_error` result. This transport-stage distinction does not produce an accepted-ID difference.

Tests use one shared fixture for shared/local/SQL paths and exercise **both `id` and `newId`**. Accepted examples include periods, slashes, underscore/hyphen prefixes, internal and surrounding whitespace, BMP Unicode, 128 ASCII characters and 64 astral characters. Rejected examples include blank/ECMAScript-whitespace-only values, wrong types, 129 ASCII units, 65 astral characters and a mixed 129-unit string. U+0085, U+180E and U+200B remain accepted, guarding against an overly broad whitespace interpretation. Source-ID tests seed existing compatible IDs and issue real duplicate commands; they do not merely test a standalone predicate.

The atomic batch test first creates the exact ID `.batch-copy` and then duplicates it to `/next.copy`. A stale second child produces `version_conflict` and restores local storage bytes / SQL file contents. Correcting CAS commits both children with exact strings preserved. Shared batch tests also cover acceptance and rejection of invalid IDs in a later child.

## Regression assessment

- The production change is restricted to the two duplicate-file ID fields and matching contract documentation. Name validation, unknown-field rejection and optional-ID generation are unchanged.
- SQL graph mutation, source locks, copied fields, author/time refresh, receipts, capability enforcement, rate limits, audit, batch dispatcher and ACLs are untouched by the fix.
- The local copy implementation and transaction/replay logic are untouched. Other local/shared operations retain their existing validation paths.
- The fix adds no new helper privilege, dependency, dynamic SQL, normalization or unbounded scan. Earlier applied migrations 001–005 are unchanged.
- Existing source/metadata/authority/replay tests and warmed-005 execution-plan cases remain in the focused file. Actual-source compiler guards were retained and their expected compiler diagnostics appear in the passing test log.

## Evidence and boundaries

Read the implementation-run logs below; did not repeat their suites:

| Log                                     | Observed evidence                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/tmp/task4b-fix1-final-focused.log`    | 47 passed, 0 failed, 0 skipped; includes new ID and atomic-batch cases plus existing file/local/compiler checks. |
| `/tmp/task4b-fix1-final-validation.log` | 7 passed, 0 failed; shared ID vectors and existing API checks.                                                   |
| `/tmp/task4b-fix1-final-typecheck.log`  | `tsc --noEmit`, no diagnostics.                                                                                  |
| `/tmp/task4b-fix1-final-lint.log`       | ESLint, no diagnostics.                                                                                          |
| `/tmp/task4b-fix1-final-format.log`     | All matched files pass Prettier.                                                                                 |
| `/tmp/task4b-fix1-diff-check.log`       | No output.                                                                                                       |

Reviewer independently ran `git diff --check` for the exact fix range (exit 0) and verified the current 006 SHA256:

```text
77d00e6c6238314e077f6536445c9eca403e8b8a1ec3aec852a394867c3338d1
```

This is the reviewed, undeployed migration hash. Initial real-PostgreSQL/build results apply to the previous 006 hash and are not presented as reruns of this correction. No new broad tests, shared database writes, browser actions, service changes or deployment occurred during this review. The only file written by the reviewer is this report. Root's dirty plan/spec and paused UI files were excluded and preserved. No subagents were used.

The earlier broad npm-test SQL barrier concern remains outside this correction and is not declared resolved. Coverage percentage, complexity thresholds, full dependency audit and runtime performance were not remeasured. No deployment/API success is claimed.

Stop condition reached: F1 verified closed, both scoped verdicts recorded, review complete. Root may proceed with its separately authorized migration/application and actual endpoint/MCP proof using this exact reviewed artifact.
