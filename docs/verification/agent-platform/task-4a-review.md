# Independent Task 4a review

Reviewed range: `9585ebafa87f3ed7b307f65f9015cf7f149cf0ee..1fe6a1090fc2d723295a1424a1f6f9990e014bc9`.

**Spec verdict: PASS for the Task 4a local implementation gate.**
**Code quality/security verdict: APPROVE.** No Critical, Important or Minor finding requiring a change was identified in the reviewed scope. This does not approve or claim hosted005 deployment.

## Method and scope

Read task-4a-brief.md, task-4a-report.md and all 3,072 lines of the supplied review diff, once in bounded sequential chunks. The report was treated as a claim inventory, not as approval. No changed source file was reread, no git command was used, no suite was rerun, and no source/index/HEAD/shared-stack/cloud state was modified. This scratch report is the sole write.

The diff includes additive005, shared validation/contracts, REST aliases/OpenAPI and the associated tests. Review was limited to that task. The frontend and hosted rollout are outside this verdict.

## Spec compliance and strengths

- Safe task reads use an explicit reservation whitelist, qualified by both workspace and task ID. The helper is a private invoker, while authorized read entry points invoke it under their existing boundary. Assignment remains distinct from reservation; expiry is evaluated with the server clock. Claim creation/renewal/release cannot appear in batch, and child responses/events do not expose a claim credential.
- Description clearing is supported without admitting null descriptions or empty titles/names. Subtask attributes are narrowly limited to historical assignee, due and note; they merge into legacy metadata. The existing graph engine supplies parent CAS, agent lease enforcement and the parent version increment.
- Comment deletion is an explicit dispatcher branch with persisted author/admin policy, comment CAS and a retained audit event identifying the comment and parent task. Replay checks the persisted prior result against current authority, including an administrator demoted after deleting another author's comment. No generic delete helper or client-supplied author was introduced.
- Batch validates a fixed SQL allowlist and a 1–100 bound, rejects foreign child envelope keys, uses one workspace and invokes the same dispatcher recursively. The workspace mutex, transactional exceptions and normal audit trigger preserve atomicity. Server-generated child idempotency namespaces avoid client pre-seeding; cached outer replay performs current membership/grant checks and walks child capability checks before returning stored results.
- Workspace settings require a direct human owner/admin before mutation or cached replay, include independent edit CAS and expose that version through reads/new creations. Existing cached creation results are deliberately preserved.
- Recurrence now requires both recurrence and a due date, advances Monthly by 30 days, sets successor start to its due date and copies historical subtask details while relying on the existing false default for the new subtask's done state. Duplication also preserves those details.
- Changes are additive and retain the single normalized operation engine, immutable application audit boundary, existing transactional outbox and snapshot fencing. No extra server, frontend change, bytes upload/model administration, automatic demo import or remote migration was introduced.

## Findings

- Critical: none.
- Important: none.
- Minor: none.

## Concrete cross-cutting checks of unchanged code

These were the only additional source reads, each resolving a named risk:

1. `202610200002_agent_operations.sql:210–263`, `operation_graph`: confirmed that newly accepted subtask attributes are actually merged, arbitrary columns are not newly exposed by the validator, parent versions are checked/incremented, and agent claim enforcement still runs. No replacement graph writer was necessary.
2. `202610200003_integration_grants.sql:143–168`, `operation_authorize`: confirmed that current membership, OAuth connection, consent, client, grant and executor binding are evaluated before replay, with row locks protecting the relevant authorization records. The brief inspection of002's corresponding function was bounded to the same authorization risk;003 remains the active implementation.
3. `202610200002_agent_operations.sql:1–84`: confirmed claim storage separation, absent application mutation grants on domain events/idempotency/claims, and the private entity projection. The new deletion does not cascade through its audit because domain_events does not reference comments.
4. `202610200004_webhook_delivery.sql:119–140`, `enqueue_domain_webhooks`: confirmed that delete_comment's parent task ID reaches normal task.updated fanout and every child's event invokes synchronous queue/ledger creation within the surrounding transaction. The aggregate batch marker has no task ID and does not duplicate child fanout.

No needed function was cut off in the review package; there were no changed-file rereads to recover missing context.

## Verification evidence inspected

Inspected only bounded summaries/PASS markers from the existing private logs, without rerunning the reported suites:

- `/tmp/task4a-node.log`: 71 tests, 70 pass, 0 fail, 1 skipped.
- `/tmp/task4a-deno.log`: 22 passed, 0 failed, 3 ignored.
- `/tmp/task4a-live-auth.log`: 2 passed, 0 failed.
- `/tmp/task4a-agent-postgres.log`: real concurrent claims, authorization, idempotency and project-sequence completion marker.
- `/tmp/task4a-oauth-races.log`: 1 pass, 0 fail.
- `/tmp/task4a-real-postgres-retry.log`: PASS005 authenticated contracts/recurrence/promotion/transactional rollback-replay; restricted migration/vendor ACL boundary; 41 reachable-function/view REST/native GraphQL boundary; real Cron/pg_net/worker path; real pgmq/Vault/HMAC delivery, retry, lease and crash/replay markers.

These corroborate the report's execution claims; they are not represented as new reviewer executions. The first interrupted environment run is not counted as success. SQL OAuth fixtures are not represented as real authorization-code exchanges.

## Coverage limits and follow-through

- The changed tests directly cover rollback after a successful queue-producing child, replay, internal-key pre-seeding, nested capability demotion, parent CAS, lease checks and the 100/101 bound. Existing concurrency suites now load005. There is no newly added two-session race dedicated specifically to two simultaneous batch envelopes; serialization is supported by the inspected existing workspace mutex and the current concurrency evidence.
- Live Auth/HTTP exercises the new public contracts; the existing real OAuth/MCP suite exercises the shared boundary. The diff does not add a separate real OAuth negative case specifically for update_workspace. The human-only check is explicit in the shared SQL dispatcher and is also recursively applied to batches.
- No frontend integration or visual result is claimed. The optional legacy SDK and native TLS fixtures remain skipped/ignored as documented. Hosted005 is not applied or verified by this review.

Stop condition met: independent task-scoped contract and quality/security review completed, evidence inspected, no blocking finding. Task 5 may consume these local contracts; cloud activation remains a separate decision and verification step.
