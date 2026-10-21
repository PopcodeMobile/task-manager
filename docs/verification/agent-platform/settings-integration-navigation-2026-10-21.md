# Settings integrations and Safari help navigation

Date: 2026-10-21. Baseline `26cab69`. Frontend-only correction; no database, authorization or Edge changes.

## Cause and correction

The user reported that clicking Help menu items in Safari closed the menu without navigating. A failing WebKit browser test reproduced the exact visible path from Settings/payment to Help/Integrations. Captured event ordering was pointerdown → mousedown on Integrations → focusout from Files with relatedTarget=null → mouseup on the underlying page. The popup was removed before click, so its handler never ran. The initial Settings navigation test also failed because Integrations had no Settings entry.

ShellPopover now dismisses focus transfers only when an actual outside focus target exists. Existing outside pointer, Escape and keyboard handling remain; window blur explicitly dismisses focus loss outside the page. This follows the [documented Safari button-focus behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#clicking_and_focus) and the [nullable focus target contract](https://developer.mozilla.org/en-US/docs/Web/API/FocusEvent/relatedTarget), with reproduction evidence taking precedence over assumptions from Chromium.

**Configurações → Integrações → Tokens de agentes** is now the primary discoverable path, under the organization's settings section. Settings reuses the existing IntegrationsPanel and its owner/admin gating. Existing direct integration URLs and Help shortcuts remain available. Local demonstration shows the existing cloud-required message.

## Verification

- Before correction: WebKit Help/Integrations failed to change URL; Settings entry was missing. A temporary event probe confirmed premature blur dismissal. The probe was removed from source.
- After correction: all 17 focused browser tests passed in WebKit and Chromium. The seven visible Help destinations, keyboard arrows/Enter/Escape, outside pointer/focus dismissal and actual Settings-to-token-issuance UI path are covered alongside the eight prior token regressions.
- ESLint, TypeScript, Prettier and token audit passed (234 public tokens / 127 source files).
- Allowlisted production build succeeded. Frozen manifest contains 145 source inputs and 6 static artifacts, with no private environment files or privileged API keys in output.

Browser cloud requests use isolated fixtures and unmatched external requests are aborted. Token issuance here verifies the visible UI path; no real token, user account or hosted data was created for this correction. The prior real backend verification remains documented in [organization-token delivery](organization-agent-tokens-2026-10-21.md).

## Publication and independent review

Published at [Kairos](https://task-manager-chi-eight-19.vercel.app), deployment `dpl_CT2q9Lv3gvBRTVzMZZJBhYanpgk4`, READY with CLI exit 0. All six production files returned HTTP 200 with the frozen SHA256; all 145 source inputs match the reviewed build. The same 17 isolated browser tests passed against the public deployment in WebKit (21.0 seconds).

Independent source and compiled WebKit review found no blocking issue. Desktop PT light and mobile EN dark navigation, bounds, screenshots and six artifact hashes passed. An access-control message was isolated to mocked requests from a prior document unloaded by the harness page.goto; the same-document SPA flow had zero pageerrors and no raw error displayed.

Source and production byte manifests are outside Git; the final local commit must match all frozen inputs. Original Task7/main/Hermes gates remain open.

## Mensagem pronta para o time

Corrigi os cliques do menu Ajuda no Safari e coloquei Integrações nas Configurações da organização. Agora eu consigo abrir os tokens pelo caminho Configurações, Integrações, Tokens de agentes. Testei os caminhos de clique e teclado pra conferir o acesso pelo mesmo caminho que a gente usa no painel.
