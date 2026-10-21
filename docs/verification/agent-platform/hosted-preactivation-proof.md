# Hosted preactivation proof, reviewed source 003

Target: dedicated task-manager Supabase ddodhyhtpgvsqzpipgcq (Delta Academy, sa-east-1). Runtime source frozen at64b6aec10e226562fb3c3d91d12f52509839d7a7. Actual runtime copy /tmp/task-manager-reviewed-runtime-003. This is a Task7 preparatory slice, not full deployment/production readiness. No004 or future005 code was included.

## Management changes and safety

- Existing hosted reviewed migrations001–003 already applied.
- CLI2.121 `functions deploy api mcp --project-ref ddodhyhtpgvsqzpipgcq --no-verify-jwt` from frozen source exited0. Bundles api14kB, mcp3.0MB. Source explicitly checks API/MCP tokens; gateway legacy JWT checking bypass does not allow unauthenticated business calls.
- Private ~/.config/task-manager/edge-runtime.env0600 contains explicit AUTH_ISSUER, AUTH_AUDIENCE, MCP_RESOURCE_URL and random independent worker secret (future webhook use). CLIsecretsset exited0, no values printed. No frontend/service-role exposure.
- Private sparse config in ~/.config/task-manager/hosted-oauth-activation/supabase/config.toml declared only `[auth.oauth_server] enabled=true,allow_dynamic_registration=true,authorization_url_path="/oauth/consent"`.
- Initialdiff: exactly3declared changes +10remote_only defaults. ActiveCLIplanner source filters remote_only; sparsepush explicitly reported3propertieschanged and10leftunchanged. Postdiff:0declared/actionable changes. Remote email confirmations remainedtrue. No full local config, signingkey, email/MFA/rate/redirect defaults were pushed.
- SiteURL remains defaultlocalhost until real frontendorigin available; browser consent cannot be claimed ready. CORSorigin not configured until thatorigin exists. No real Hermes or Claude grant created.

## Public runtime probes

- GET /functions/v1/api/workspaces ->401 safeAuthenticationrequired JSON.
- POST /functions/v1/mcp initialize withoutAuthorization ->401 and `WWW-Authenticate: Bearer resource_metadata="https://ddodhyhtpgvsqzpipgcq.supabase.co/functions/v1/mcp/oauth-protected-resource"`.
- GET thatresource metadata ->200, resourceexactMCPURL and authorization_servers Authissuer.
- Authprefixed OAuthauthorizationserver and OIDCdiscovery ->200 afterenable; issuerexacthttps://ddodhyhtpgvsqzpipgcq.supabase.co/auth/v1; authorization/token/registration endpoints correct. JWKS ES256 alreadyverified, no rotation.
- NegativeAPI response X-Request-ID header includes repeatedsameID (gateway+handler), whileJSONhascorrectsingleID; diagnosticonly, no demonstratedauth/datafailure.

## Real hosted OAuth/MCP fixture

Privateenv wrapper loaded existinganon/service credentials fromoutsidegit and ran fromfrozen003 source:

`TEST_MCP_URL=https://ddodhyhtpgvsqzpipgcq.supabase.co/functions/v1/mcp deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/tests/oauth.test.ts`

Output:1passed,0failed,30s. Private log /tmp/task3-hosted-oauth-runtime.log0600. TEST_OAUTH_SIGNING_KEYS wasNOTprovided; localnegativeJWKfixtures are nothostedissuerproof.

The existingtest creates2confirmed disposableAuthusers, signsin normally, registers1publicOAuthclient, obtainsrealPKCEcodes withdistinctworkspacegrants, exchangesandrefreshes; usesactualhostedMCPendpointviaofficialSDK forall12tools. Proves read/write and tenantisolation, immediateconnectionrevocation, membershiprevocation, Authconsentrevocation andreconsent, browserJWTrejection byMCP, privatelegacyfences. It usesrealhostedDB/REST throughout. Its APIbusinesscalls use anativehandleragainsthostedDB; thereforethis doesNOTprove positivebusinesscallsthroughhostedAPIURL. PublicnegativehostedAPIprobe isseparateabove.

Finallycleanupassertedworkspacedeletion; followupadminlist returned0remaining oauth-*@example.test fixtureusers. OAuthclientcleanupinvoked byfinally. No userPII/tokens logged, no externalmessages.

These two syntheticAuthprincipals areNOTtwoactualClaudeusers. RemainingTask7:005+004review/deploy, frontendcompleteparity, hostedAPIpositiveproof, webhookprivateworker/Cron/TLS, actualHermesconfigured/scopedagentworkflow, userDNS/TLSforpublicwebhook, andtwoactualClaudeaccounts/isolation/revocation. Source/doc changes after003requireappropriateredeploy+targetedvalidation.

## Reviewed004 deployment and actual hosted boundary

Source9585eba, frozen outside worktree /tmp/task-manager-reviewed-runtime-004. Actual local and hosted004 migration CLIexit0, workerdeployexit0. Actual declared API settings match public,graphql_public and extra search path public,extensions; diff has no actionable API changes. Catalog bridge audit:38 reachable productionobjects; APIrolesNOLOGIN. WorkerGET405, missing/public keyPOST401, actualdedicatedkeyPOST200 emptyqueue.

Temporary actual-token test adds90 REST/GraphQL boundary checks to the reviewed OAuth fixture, without modifying repository source or weakening hostedconfig. Initial test assumed enabledGraphQL and failed; diagnosis showed exacterror pg_graphql extension not enabled. Updated temporary assertion accepts that exactdisabledresult or enabledQuerytypename; protectedcollectionqueries muststillfail. Final1/1pass31s, private log /tmp/task4-hosted-boundary-runtime-green.log. Realhuman+realPKCEOAuth+anon privateRPC/schema/aliasdenials and existing12tools/refresh/revocations pass. This isactualhostedproof; localfixtureenabledGraphQLproofremainsseparate.

Trusted CLI scheduler setup succeeded; realhostedCron run usernamepostgres succeeded, net responseid1 HTTP200, nottimeout/error, bodyclaimed0/completed0. Privateworkerkey loadedonlyfromoutsidegit. Job1 disabled after thisproof and active=falseverified; state ~/.config/task-manager/hosted-scheduler-state.json0600. Do not enableautomaticallybeforeHermes/connection/receivergates. Vault contains schedulerkey/URL, not a subscriptionsigningsecret yet. NoactualHermesdelivery or hostedDNS-pinnedoutboundTLSproof is implied by anemptyqueuewake-up. Hosted005 and finalAPIredeploy still awaitreviewedTask4a.

## Reviewed005 hosted activation

Source 1fe6a1090fc2d723295a1424a1f6f9990e014bc9 frozen outside repository at /tmp/task-manager-reviewed-runtime-005 after independent spec/quality PASS. Migration202610200005_ui_contracts.sql SHA256fe45e98a567bfff5982f217f7c38a1264e3d9d7dce86b115dfd15bda48e77e79 applied to dedicated hosted project by CLI exit0; api+mcp redeployed from that frozen source, CLI exit0. Private deployment logs ~/.config/task-manager/deploy-reviewed005.log and deploy-functions005.log. No in-progress frontend code deployed.

Actual hosted005 HTTPS API fixture PASS1/1, private /tmp/task5-hosted005-api.log. Temporary harness outside git derives reviewed integration.test.ts, replaces native handleRequest with actual /functions/v1/api/v1/workspaces HTTPS, uses confirmed disposable admin-created account then normal password login (hosted email confirmation setting unchanged), and finally removes workspace/account. Exercised new workspace edit CAS, subtask detail parent-version batch, atomic rollback/replay, comment author/delete replay, safe reservation projection, recurrence successor, current demoted-admin/revoked-membership rejection, existing task CAS and tampered JWT rejection. This is actual hosted API proof, separate from vendor Claude/Hermes activation.

Reviewed005 actual hosted MCP/OAuth regression PASS1/1 (private /tmp/task5-hosted005-mcp.log): frozen1fe6a10 fixture against hosted MCP transport and hosted Auth, all12tools, two synthetic principals, PKCE/refresh and current-grant/connection/Auth-consent/membership revocation. This is not two real Claude users. No negative local signing-key fixture supplied. Finally cleanup succeeded.

Reviewed005 hosted read-only catalog audit PASS:41 reachable application functions/views, new private reservation/batch helpers retain expected restrictions, no sensitive-schema bridge. Migration journal005 present exactlyonce; API anon/auth roles remain NOLOGIN; Cron job still active=false. Actual exposed-schema settings were confirmed by prior sparse API diff, unchanged during005 rollout. Repro script /tmp/task5-hosted005-audit.mjs contains no credentials, loads private env internally.

## Reviewed006 file duplication prerequisite

Independently approved source `f1bf6030a357418434aad7ca5e0c1ab1985da39e`, including initial `75a47d9` and F1 ID-parity correction. Frozen outside worktree at `/tmp/task-manager-reviewed-runtime-006`. Migration006 SHA256 `77d00e6c6238314e077f6536445c9eca403e8b8a1ec3aec852a394867c3338d1`. Existing001–005 unchanged. Dry runs confirmed exactly006; local and dedicated hosted application exit0. API and MCP deploy from exact frozen source exit0; no frontend or webhook worker deployment, no Auth configuration change, no scheduler activation.

Actual endpoint probe `/tmp/task4b-live-probe.mjs` PASS29 assertions in local and hosted modes. Logs `/tmp/task4b-local006-api.log` and `/tmp/task4b-hosted006-api.log`, private0600. Confirmed disposable user uses normal password JWT for observed commands. Admin access is confined to disposable confirmed-user creation, seeding unknown historical metadata, inspection and cleanup. Positive source-owned file copy with destination `copy.v2`, default name, unknown nested metadata, new authenticated actor/time, source version/metadata intact, no copied joins; replay, changed-key payload, stale CAS, collision, arbitrary input rejection, cross-workspace source denial and atomic rollback verified. Each run cleaned two disposable workspaces and the user. Initial local harness mistakes (unsupported fileType `gz`, then assuming collision409 instead of existing validation422) were diagnosed against existing validators/tests and corrected; logs preserved as fixture-error / expectation-error, not product failures. No production contract changed to satisfy the probe.

Read-only hosted catalog audit `/tmp/task4b-hosted006-audit.mjs` PASS:43 reviewed reachable objects, migration006 exactlyonce, API roles anon/authenticated NOLOGIN, Cron active=false. Existing exposed-schema configuration unchanged. This audit boundary follows the accepted pg_net/Data API design; it does not claim database operators cannot read vendor transient request headers.

Preparation note: first archive attempt used a Python tarfile filter keyword unsupported by the worktree's Python3.9; the failed extraction left an empty destination. A following dry-run connected with default config and rejected unrelated migration history; it made no changes. No repair/reset was attempted. Root diagnosed the interpreter/cwd difference, used native tar for the trusted git archive, asserted exact task-manager-review config/61922/hash before CLI, and supplied the existing private signing-key file after explicit missing-file preflight. Only the verified006 dry-run was followed by application.

Reviewed006 hosted MCP/OAuth regression PASS1/1,27s (`/tmp/task4b-hosted006-mcp.log`): actual hosted MCP transport and Auth, all12 tools, two synthetic principals, PKCE/refresh and immediate connection/consent/membership revocation. Private signing-key override explicitly removed. This remains synthetic fixture proof, not two actual Claude accounts. Cleanup completed through existing fixture finally logic.

## Reviewed007 complete task graph copy

Source `edbf2961f7c21a2e2a6aa691748d89a13dd81480` independently approved Spec/Quality PASS, zero findings. Additive `202610200007_task_graph_copy.sql` SHA256 `cb78ea5947b142866ed1dd1e7fc087923223d6363b941dba0f0a88f46e9369f5`, frozen outside repository `/tmp/task-manager-reviewed-runtime-007`. Config/target/hash asserted before CLI; local and hosted dry runs showed only007, application exit0 each. API/MCP deploy from that exact source exit0. No001–006 edit, Auth change, frontend/webhook-worker deployment or scheduler activation.

Independent actual endpoint probe `/tmp/task4c-live-probe.mjs`:96 assertions PASS locally and96 hosted, logs `/tmp/task4c-local007-api.log` and `/tmp/task4c-hosted007-api.log` private0600. Normal human password JWT performs all observed copy commands. Admin setup creates disposable confirmed user and seeds historical source metadata/done timestamps only; admin also inspects and cleans fixtures. Both modes preserve source unknown task/subtask/attachment-join data, completed child state, label and original dependency targets; taskmode preserves done/completedAt, projectmode todo/null. New IDs/keys and current creation timestamp, no archive/executor and no recurrence successor. Replay matches result/event; changed payload, stale CAS, arbitrary input, tenant source mismatch and failed projectcreate+copy batch reject/rollback. Source row/children/joins remain identical; original file owner/project remain unchanged. Both runs cleaned two workspaces and user.

Read-only hosted catalog audit `/tmp/task4c-hosted007-audit.mjs`:46 reviewed reachable functions/views, migration007 exactlyonce, API anon/authenticated NOLOGIN, Cron active=false. Existing exposed schemas unchanged. Deployment and audit logs have task4c-local007 / task4c-hosted007 prefixes under/tmp. This is actual API proof, not UI6b4 wiring or actual Hermes/Claude activation. Hosted MCP regression is separately recorded after it completes.

Reviewed007 hosted MCP/OAuth regression PASS1/1,27s in `/tmp/task4c-hosted007-mcp.log`: actual hosted transport,12tools, two synthetic principals, PKCE/refresh and immediate revocation. Private signing-key override removed. Fixture cleanup completed; no real Claudeuser/Hermes claim.

## Reviewed008 — team relationship baseline guards

Source c7694842f35fa483ffd20a6f13d00b2d3d130dd2; independently approved task-4d-review.md. Frozen /tmp/task-manager-reviewed-runtime-008, migration202610200008 SHA2562b6b58df4b35e0236a992d5b304efa4041f40a085a340b7b34753cac5f1f0a39. Dryruns listedonly008; local+hostedapplyexit0. API andMCP deployed exactsource; noAuth/site/CORS/scheduler/worker/frontend changes. MCP remote bundler firstattempt failed400 for bareimport @supabase/server because root omitted importmap; verifiedinstalledCLI --import-map support and existingdeno.json, correctedcommand with explicitmap succeeded, sourceunchanged. Existing[inbucket]deprecationwarning remainsnonfatal.

ActualHTTPSAPI probes /tmp/task4d-live-probe.mjs0600:62assertionsPASS eachlocal+hosted. NormalhumanJWT commands, adminonlyfixtureunknownmetadata/Authusers/setup/inspection/cleanup. Two simultaneous batches share emptybaseline; one200/one409, loser metadata/version/relations/receipts/events unchanged, winnerchild+parent audit and replay stable. Explicitreviewed move succeeds; unguardedmultiteam semantics intact; unorderedsets/new/deleted/foreignexpectedteams/missingusers/malformedguards/tenant/guest/outsider checked; guard notentitymetadata and unknownsretained.2disposablews/2Authusers cleaned eachrun. Final logs /tmp/task4d-local008-api.log and /tmp/task4d-hosted008-api.log. Initialrootprobe errors retained -first.log (incorrect1audit assumption,005 actuallychild+parent receipts/events) and -second.log (fixture table name wrongworkspace_members vsactualworkspace_memberships); source diagnoses precededcorrection, allfixturescleaned, no productpatch.

Read-only catalog /tmp/task4d-hosted008-audit.mjs:48reviewedreachableobjects, migration008once, anon/authenticatedNOLOGIN,Cronactivefalse. HostedMCPregressionpendingatthisappend, noactualHermes/Claude accountconnectionclaim.

Hosted008 MCP/OAuth regression complete: /tmp/task4d-hosted008-mcp.log,1/1PASS32s, actual configured hostedresource/12tools/PKCE/refresh/authorityrevocation; fixturescleaned byexistingharness. Historicaltesttitle sayslocal, but privatewrapper pins TEST_MCP_URL/SUPABASE_URL to reviewedhostedddodhyhtpgvsqzpipgcq (see /tmp/task4d-hosted-mcp.mjs). This is syntheticAuthprincipalproof, not2Claudevendorusers. Task4d runtimegate complete.
