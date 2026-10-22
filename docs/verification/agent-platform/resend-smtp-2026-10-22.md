# Resend SMTP activation verification

Date: 2026-10-22. Baseline `3e614c3`. User authorized Resend configuration, selected `send@deltaacademy.com.br`, and supplied a credential. Dedicated Supabase project: `ddodhyhtpgvsqzpipgcq`.

## Result and credential boundary

Supabase Auth now sends through Resend SMTP as **Kairos <send@deltaacademy.com.br>**. Verified root domain `deltaacademy.com.br`, region `sa-east-1`. Host `smtp.resend.com`, TLS port465, SMTP user resend. A new dedicated key named Kairos Supabase Auth was created with sending_access and the verified domain ID. The chat-exposed key was used only for provisioning/verification, not as the production SMTP password. That supplied key still requires rotation by its owner; no potentially shared existing key was revoked automatically.

Credentials and private before/after configuration are outside Git in0600files within a0700directory. The CLI received the dedicated credential through its child environment. Mail bodies, OTP/action links, passwords, JWTs and provider response bodies were kept in process memory, never in this receipt or safe evidence. No application code, migration, frontend deployment, Edge deployment or message to a human recipient was involved.

## Configuration proof

- Resend domain API returned verified for the exact sender domain. Both bootstrap and dedicated SMTP TLS logins returned235 without sending messages during credential validation.
- A fresh private configuration snapshot preceded activation. Sparse config declared SMTP fields only. Independent source review confirmed CLI v2.121.0 includes declared local_only fields and skips remote_only defaults.
- Exact push updated Auth and reported only SMTP pass in secrets.sent; no skipped/unencodable/gated/empty secret. The wire scope is smtp_host, smtp_port, smtp_user, smtp_admin_email, smtp_sender_name and smtp_pass.
- After applying, the declared nonsecret SMTP diff has0updates and0local_only properties. The same12undeclared remote_only properties remain preserved.
- Readback matches enabled=true, chosen sender/name, host465/user. Entire before/after TOML outside the SMTP subtree compares equal. Email confirmation stays enabled, the production Site URL and OAuth remain enabled, and password/session/redirect/rate/template settings were not altered.

The first readback into a blank private file omitted SMTP. Official CLI source investigation explained why: the API omits the SMTP secret; pull drops an enabled family that would be invalid without its required local pass. A second readback retained the local environment reference and showed the full active SMTP section. No speculative second hosted update was made. This is a readback limitation, not evidence of an absent SMTP configuration.

## Real controlled Auth and mail proof

All30checks passed. Two unique aliases at the provider-owned `delivered+label@resend.dev` test addresses were used.

| Flow                 | Observed result                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Public signup        | HTTP200, fixture user created without confirmed email/session before following its mail link                                       |
| Signup email         | Matched message from chosen sender in Resend; valid Supabase verify link, signup type and production `/auth/callback?returnTo=...` |
| Email confirmation   | Real mail link returned302/303 with a real session; authenticated `/user` matched the exact fixture                                |
| Password recovery    | Separate confirmed synthetic user; public recover endpoint returned200 and matching Resend email                                   |
| Recovery link        | Correct recovery type, production callback and mode=recovery; real issued session matched the fixture                              |
| Password replacement | Auth password update returned200; subsequent password login with the replacement succeeded for that exact fixture                  |
| Provider events      | Both matched messages reported last_event=delivered                                                                                |
| Official cleanup     | Both exact fixture users deleted by Auth admin API with200; GET by each ID returned404                                             |

These are provider delivery simulations, not human inbox acceptance tests. No message was sent to a real user. Resend retains its ordinary test message metadata/content; the two synthetic Auth users were removed, and no fixture workspace was created. Tokens/passwords/action links were not saved in local safe evidence.

Safe runtime evidence outside Git: domain/key metadata, SMTP authentication, exact sparse diff/apply metadata, verified readback/config comparison,30individual checks, both provider events and exact-user cleanup results. This receipt describes their limits rather than claiming broader application notification support.

## Independent review and stopping condition

Independent review checked CLI planner/encoders/secret resolution from official v2.121.0 source and safe activation artifacts. Final mail-proof review passed independently:30/30checks, exact sender/settings convergence, preserved non-SMTP config and confirmed cleanup; report saved separately in the worktree review directory. Stop when chosen SMTP values converge, unrelated settings are preserved, controlled Auth sends/links/password recovery and cleanup pass, and no secrets enter staged files.

Original Hermes/webhook/Cron and two-real-Claude-user Task7 gates remain open. The integration branch still receives only a local conventional commit; no push/main merge is claimed.

## Mensagem pronta para o time

Configurei o envio de e-mails do Kairos pelo Resend, com o remetente Kairos <send@deltaacademy.com.br>. Testei confirmação de cadastro e recuperação de senha, incluindo os links e a troca de senha. A integração usa uma chave própria de envio, restrita ao domínio da Delta. A chave compartilhada no chat precisa ser rotacionada; o Kairos já usa outra credencial.
