# Resend delivery for Supabase Auth

User authorized configuring Kairos email delivery through Resend, selected `send@deltaacademy.com.br`, and supplied a credential. Domain API confirms the root domain is verified. Use sender name Kairos, official Resend SMTP host465TLS and username resend. The supplied credential is used only to provision a dedicated sending_access key restricted to the verified domain. Supabase uses that newly created key; both credentials live only in private0600storage/environment, never Git or receipts. Rotate the chat-exposed bootstrap key after setup; the dedicated SMTP credential is separate.

## Acceptance and scope

Confirmation and password-recovery emails from the existing Supabase Auth flows are accepted by Resend, using the chosen sender and production callback URL. Existing confirmation/password/OAuth/session/redirect/rate settings are preserved. No application notification/marketing feature, template redesign, frontend/backend deployment, migration, Cron/Hermes or main integration is included.

## Steps

1. Read verified domain and current hosted configuration; save fresh private before-state and prepare sparse SMTP-only configuration. Preview the exact diff and validate authenticated TLS SMTP credentials without sending to human recipients.
2. Review the concrete SMTP-only change, apply with the already authorized Supabase CLI, then independently pull configuration and verify chosen sender/host/port, preserved Auth settings and no unrelated diff.
3. Use unique Resend `delivered+label@resend.dev` fixture addresses for confirmation and recovery tests through real Supabase Auth; retrieve only matched test email records from Resend for provider evidence. Never persist response tokens/action links/passwords or print raw mail bodies. Cleanup exact fixture users and verify absence. Record provider delivery simulation versus real mailbox limits, independent review and safe receipt. Commit configuration documentation locally, preserving Task7 main gate.

Stop when SMTP is active, controlled auth sends and cleanup pass, before/after settings are verified and the receipt is independently reviewed. If rollback is needed, restore only the prior SMTP fields, preserving concurrent changes to unrelated Auth settings.

## Delivery record

Domainverified; dedicated sending_access key restricted to domain; SMTP TLSAUTH235. Exact sparsepushsent SMTP secret andfields; nonsecretSMTPdiff0updates/0local_only,12undeclaredremote_onlysettings preserved. Freshpull seeded withlocalenvplaceholder enabled fullSMTPreadback; allconfiguration outsideSMTPcompares equal. Initialblankpull omittedactiveSMTPbecause missinglocalrequiredsecret led CLI would_invalidate familydrop; sourceinvestigation resolvedverification without further hostedmutation.

RealSupabaseAuth+Resend proof30/30PASS: signupconfirmation, recovery/passwordupdate/newlogin, chosen sender/productioncallback/mode preserved, bothprovider delivered simulationevents. Officialcleanup2usersdeletedGET404. Independentreview and receipt close the task; no applicationcode/migrations/deployments changed. Local conventional documentation commit only; originalTask7/main gate remains.
