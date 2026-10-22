# Kairos custom domain: activation receipt

Date: 2026-10-22. Baseline `a7a5959`. User selected the suggested Delta Academy hostname `tarefas.deltaacademy.com.br`.

## Completed preparation

Vercel CLI65.0.0 returned domain_added, attached to existing task-manager project in Delta Academy. Domain ownership is current-scope; project attachment verified. No project move, domain purchase, nameserver transfer, deployment rebuild or existing domain removal occurred.

DNS authority is GoDaddy: ns75.domaincontrol.com and ns76.domaincontrol.com. Both authoritative queries currently return no tarefas CNAME. Vercel reports invalid_configuration and recommends:

| Type  | Name    | Value                               | TTL              |
| ----- | ------- | ----------------------------------- | ---------------- |
| CNAME | tarefas | 78db16dfef7d6da9.vercel-dns-016.com | Provider default |

Only this unused subdomain needs a record. Do not alter nameservers, root-domain records, MX, Resend, Hermes or other services. GoDaddy opened in Chrome but requires user login; the tab was retained for handoff. The user can create the record directly or authenticate so the authorized DNS setup can continue.

## Prepared, not applied

The private sparse Auth configuration changes exactly site_url and additional_redirect_urls. Planned Site URL is https://tarefas.deltaacademy.com.br. Existing Vercel callback remains allowed; the exact new root and /auth/callback are added without wildcard domains. The existing API_ALLOWED_ORIGINS secret metadata value is a SHA256 digest, which matched the saved current Vercel origin. Planned CORS adds the custom origin while preserving that existing origin.

Fresh private before-state retains Resend SMTP active as send@deltaacademy.com.br, email confirmations enabled and OAuth enabled. No Auth or CORS change has been applied: primary Auth URLs must not point to an unresolved hostname. Current production remains https://task-manager-chi-eight-19.vercel.app. Original main/Hermes/Task7 gates remain unchanged.

## Remaining completion checks

After the CNAME exists: verify authoritative/public DNS, Vercel configuration and HTTPS; compare the six current public artifact hashes and SPA routes at the custom host; apply reviewed sparse Auth/callback and CORS changes; verify before/after settings, allowed/denied CORS and controlled auth/consent links. Existing SMTP/private credentials are not part of the Git change. The task remains pending user-controlled DNS access, not completed activation.

References: [Vercel domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). Provider/plan/before-state safe evidence is outside Git in the private activation directory; independent review is kept in the worktree review directory.

## Activation (2026-10-22)

- DNS: user created the CNAME in GoDaddy. Both authoritative nameservers, 1.1.1.1 and 8.8.8.8 return `78db16dfef7d6da9.vercel-dns-016.com`. Vercel reports `configured_correctly` and verified for task-manager.
- HTTPS: automatic issuance did not start within 15 minutes (no certificate entry for the host while the other Delta subdomains had one). `vercel certs issue` created it: Let's Encrypt YR2, CN `tarefas.deltaacademy.com.br`, valid until 2027-01-20. Both edge IPs serve it with a verified chain.
- Static parity: `index.html` and the four JS/CSS assets have identical SHA-256 on both hosts; `/auth/callback`, `/oauth/consent` and `/settings` return 200.
- Auth: fresh pull matched the 07:19 snapshot. `supabase config push` from that pull changed only `auth.site_url` and `auth.additional_redirect_urls`; the SMTP password env reference was unresolved and reported `not_set`, so nothing was sent for it. After-pull diff against the before snapshot shows only those two lines; SMTP stays enabled with the same sender and email confirmations stay on.
- CORS: `API_ALLOWED_ORIGINS` digest matched the old single origin before the change and the planned two-origin value after it. Preflight to the API returns the matching `access-control-allow-origin` for both hosts and none for a foreign origin.
- Not run: a real signup/recovery email and a Claude OAuth consent on the new host, since both act on real accounts. The old Vercel URL stays allowed in Auth and CORS.

Private before/after snapshots and the safe receipt are in the activation directory outside Git.

## Mensagem pronta para o time

O Kairos agora responde em tarefas.deltaacademy.com.br, com HTTPS. Os links de login e recuperação de senha passam a apontar pra esse endereço. O endereço antigo na vercel.app continua funcionando, então ninguém perde acesso na troca.
