# Hermes public endpoint preflight

2026-10-21. DNS, HTTPS and public health are verified. This closes the public-hostname prerequisite only. The Task Manager route, live OAuth/MCP authority, durable delivery/recovery, retention and real-user acceptance remain open.

## Public verification

The controller ran a normal certificate-verifying HTTPS GET without credentials or `--insecure`:

```text
https://hermes.deltaacademy.com.br/health
http_status=200 tls_verify=0 remote_ip=72.62.15.30
JSON status: ok
```

The user reports the signed diagnostic route was validated without invoking the model and that Slack, Lua, Clara and publishing remain operational. This controller did not send a webhook POST or independently repeat that signed test.

## Read-only runtime observations

SSH used the previously authorized server, `root@72.62.15.30`, with BatchMode and a bounded connection timeout. Allowlisted readers returned structural configuration and service metadata only; no secret, environment value outside approved configuration paths, message or session record was printed or copied.

- Installed Hermes source remains `493208879a3248c6a4b844981d2c31c78ae00929`.
- The main gateway is running and reports served profiles `default`, `clara`, `comercial`, `operacoes`, with Slack and webhook platforms in its runtime metadata.
- Its webhook listener is enabled on private bridge address `172.18.0.1`, port8644. The configured route inventory contains `infra-ping`, with `profile` and `script` fields; no `task-manager` route is configured in that static inventory.
- The selected main configuration has no MCP server named `task_manager`.
- Main gateway, separate Lili gateway, Clara CS, social publish and social review services remained active with the same PIDs across the inspection. No restart or remote configuration write was performed. The auxiliary Lua login unit is not evidence of the Lua bot's operational state; no independent Lua conversation test was attempted.
- Main configuration still has no explicit `sessions` section. The selected process exposes `HERMES_HOME=/root/.hermes` and no additional Hermes config/profile/managed/worker/session selector names; the default managed config file is absent. This narrows the earlier configuration uncertainty but does not prove the complete retention/manual-deletion policy or delivery/replay horizon. The existing [retention gate](task-7-hermes-retention-preflight.md) remains open.

## Next activation boundary

The user confirmed that the panel is not yet published and will provide Vercel access. Its actual public origin is needed for Auth Site URL, redirects, consent and CORS before the real Hermes OAuth/workspace grant can be completed. The signed diagnostic route does not establish those permissions.

After publication and human authorization, configure only the Task Manager MCP server and scoped task route, then prove assignment→webhook→MCP→comment/completion and a failure/resume. Keep the existing runtime and other profiles intact. Verify durable admission and retention before enabling delivery.

Do not run the subscription or scheduler CLI as a connectivity probe: subscription provisioning enables a subscription, and scheduler setup creates an active job. Neither was executed. No signing secret was rotated or extracted, no model/provider request was made, and no queue/Cron/production activation was performed.

The [reviewed009 runtime proof](runtime-009-proof.md) remains authoritative for backend deployment. Older008 handoff statements are historical, not the current backend state. Local design acceptance is recorded separately in the [design verification](../../superpowers/verification/2026-10-21-design-parity.md).

Stop condition: record verified public transport and the actual unconnected route/MCP boundary; wait for the already-requested publication access before dependent OAuth activation.

Independent verification: PASS, no findings. A separate verifier repeated the certificate-verifying public GET and bounded read-only SSH inspection, confirmed the static route/MCP inventory and all five service PID baselines, and checked that the documentation preserves the remaining gates. Scoped Markdown formatting and `git diff --check` passed. All125 product-file hashes remain unchanged from the accepted design artifact; no runtime test suite was rerun for this documentation-only update.

## Suggested internal update

Configurei o domínio do Hermes com HTTPS e confirmei o /health retornando 200. A próxima etapa é publicar o painel na Vercel, conectar OAuth/MCP e testar uma tarefa completa. Os serviços existentes continuam ativos.
