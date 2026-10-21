# Task 4b independent spec and quality review

Reviewed commit range: `dac6c8ce2039581bc25105b79ac1d60beec44753..75a47d9d822f32aa5213e6db14d9aa7dc68fac83`.

Artifact: `review-dac6c8c..75a47d9.diff`. Read the review handoff first, then the task brief and implementation report. Reviewed all 18 owned files and the relevant unchanged SQL dispatcher, authorization/capability, validators, canonical local projection and local transaction context. No context-manager tool was exposed; the supplied brief/handoff and repository source supplied the review context.

## Verdicts

- **Spec: FAIL / changes required.** One strict API/shared/SQL/local validation parity defect remains (F1).
- **Quality: CHANGES REQUIRED.** One P2 correctness finding; no P0/P1 or critical security issue identified in this scoped delta. Fix and targeted re-review are required before clearing this prerequisite.
- Findings: **1 total: P2 = 1; P0 = 0; P1 = 0; P3 = 0.**

## F1 — P2: use the same ID acceptance contract for duplicate_file in every adapter

Changed location: `src/workspace/local-command-rules.js:32`. Related changed locations: `supabase/migrations/202610200006_file_duplication.sql:12-13` and `supabase/functions/_shared/validation.ts:59`.

Registering the new operation delegates its IDs to different existing validators. The public documented command `{input:{id:"source",newId:"copy.v2"},expectedVersion:1,...}` is accepted by the shared validator and successfully inserts a SQL file with ID `copy.v2`, but the identical local command rejects with `validation_error`. A caller selecting explicit IDs cannot use the same command in local and cloud mode. This violates this task's explicit exact-validation/parity requirement; the existing general validator difference is now exposed by the newly added operation.

The precise ID boundaries in current source are:

| Layer                    | `id` / `newId` acceptance                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared command validator | String, nonempty after JavaScript `trim()`, at most 128 JavaScript UTF-16 code units; no identifier character pattern.                                                                             |
| SQL 006 validator        | Delegates each ID to 005 `update_file`: string, nonempty after SQL `btrim()`, at most 128 PostgreSQL characters; no identifier character pattern. The file table additionally checks length 1–128. |
| Local adapter            | `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`, via `local-panel.js:454-457`: ASCII alphanumeric first character, then ASCII alphanumeric, underscore or hyphen only.                                         |
| Added OpenAPI schema     | String with minLength 1 and maxLength 128, no pattern.                                                                                                                                             |

Thus punctuation such as a period is sufficient to reproduce the difference, without relying on Unicode length or whitespace semantics. `copy.v2`, `copy/v2` and `copy v2` satisfy the shared/SQL rules but not the local pattern. The source-ID field is subject to the same mismatch.

**Independent proof, executed during review:** a fresh in-memory PGlite instance loaded the real bootstrap and migrations 001/002/005/006, created a workspace and `source`, then called the real `execute_operation` under `authenticated`. An independent memory-backed local repository used the same source and input. The probe exited 0 with:

```text
SQL duplicate newId copy.v2: copy.v2
Local identical input: validation_error
```

A separate direct Deno call to the actual shared validator exited 0 with:

```text
Shared validator accepted: copy.v2
```

**Fix:** choose and enforce one explicit ID contract for this operation in shared, SQL, local and OpenAPI, without unintentionally changing unrelated operations. Add matching accepted/rejected boundary cases for both `id` and `newId`, including punctuation/leading-character and length boundaries, and an atomic batch case. Ensure any narrower source-ID rule remains compatible with IDs already accepted by the cloud API. Re-run the focused affected checks and re-review the resulting commit; no broad suite is needed solely for this correction.

## Requirements verified by source and supplied evidence

- Strict field allowlist is `id,newId?,name?`; no writable author, time, project, task or arbitrary metadata input was added. Missing source version cannot commit; batch validation requires it.
- SQL copies unknown metadata server-side, and canonical project/task/type/size come from the locked source row. New ID/name/time/actor and existing author/date aliases are refreshed. SQL source row/version and attachment joins are not updated, and copied joins are not inserted.
- Local duplication uses the existing canonical file lookup/projection, deep-clones unknown nested values, preserves global/embedded first-parent ownership and explicit null ownership, and materializes only the new copy. Collision checks include embedded files. The local actor comes from a current member, not the device namespace, and cached single/batch replay checks recorded authorship.
- File `createdAt` is declared in the DTO. Local projection uses historical `at`, converts numeric epochs and returns an empty string when absent, without introducing a write on read. Historical author resolution/import behavior is unchanged.
- The existing authenticated dispatcher is unchanged. It authorizes before replay, retains workspace serialization, receipt fingerprints, actor/client/connection scoping, rate limits, audit and transactional batching. The new graph branch checks tenant-qualified source CAS and applies existing agent restrictions to task-owned or attached sources. Current membership, read-grant downgrade and connection revocation are exercised by the supplied tests.
- The additive 57-line migration uses narrow wrappers around renamed private INVOKER helpers. Empty search paths and revokes cover wrappers and renamed helpers. There is no copied engine or new exposed arbitrary metadata writer. The reachability audit accounts for the renamed existing dynamic-SQL helper; direct RPC-denial coverage was added.
- The new file ID is used as event entityId. Existing task ownership is retained in event payload via the dispatcher/local projection.
- MCP tool definitions/capabilities and migrations 001–005 are unchanged. No dependency change, timeout increase or compiler-guard removal appears in the owned diff.

## Evidence inspected

These are implementation-run logs read during review, not suites rerun by the reviewer:

| Evidence                                                | Observed result                                                                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/tmp/task4b-final-focused.log`                         | 86 tests passed, 0 failed, 0 skipped; includes local/SQL duplication, OAuth, agent, canonical projection and compiler guards.                                     |
| `/tmp/task4b-validation.log`                            | 13 passed, 0 failed; shared validation/API/MCP checks.                                                                                                            |
| `/tmp/task4b-real-sql.log`                              | Real PostgreSQL/pgmq/Vault/Cron suite: 1 passed, 0 failed, 0 skipped. Source includes 006 duplicate and queue-producing batch rollback, plus RPC boundary checks. |
| `/tmp/task4b-typecheck.log`                             | `tsc --noEmit`, no diagnostics.                                                                                                                                   |
| `/tmp/task4b-final-lint.log`                            | ESLint, no diagnostics.                                                                                                                                           |
| `/tmp/task4b-final-format.log`                          | All matched files pass Prettier.                                                                                                                                  |
| `/tmp/task4b-build-summary.log`, cloud/local build logs | Both builds exit 0; scan summary reports zero literal private credential matches and unchanged `.env.local`.                                                      |
| RED logs                                                | Expected missing-operation/missing-DTO failures precede implementation; validator RED records one failure.                                                        |

Reviewer additionally ran only the two focused F1 probes, a read-only `git diff --check` on the exact commit range (exit 0), and migration SHA256 verification. The 006 hash matches the implementation report:

```text
307d77aa07c1e97c1e2bfbfff0612b759be2f26305c0fcccf992588f758706d8
```

## Limits and stop condition

Root's dirty plan/spec and paused UI files are excluded. Build logs include that paused UI worktree source, so they are corroborating integration evidence rather than a clean-commit-only build claim. No shared-local/hosted database, service process, browser or deployment was touched; the review's SQL probe was isolated in memory. No product files were edited. No subagents were used.

Coverage percentage, cyclomatic-complexity thresholds, whole-project dependency vulnerability status and performance benchmarks were not measured; this review does not claim those numerical/global checklist gates. No novel external-library behavior was assumed or researched. The known earlier broad npm-test SQL barrier timeout remains a separate final-6d concern; this review neither attributes it to 4b nor claims it is resolved. Separate OAuth concurrency scripts were not rerun. Live endpoint/deployment proof remains root-owned after the corrected artifact clears review.

Stop condition reached: scoped review complete, one actionable P2 documented, both gates remain pending the fix. No deployment clearance is given for this artifact.
