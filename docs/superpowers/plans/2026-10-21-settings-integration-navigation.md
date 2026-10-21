# Settings integrations and help navigation correction

User report: Help menu items do not navigate in Safari; organization integrations should be in Settings.

Acceptance: clicking every Help item from Settings navigates and closes the menu; Settings has an organization Integrations section with the existing authorized token lifecycle; direct integration URLs remain valid. No auth/schema changes.

Scope: ShellPopover focus handling if confirmed by WebKit reproduction; SettingsPage section; focused browser regressions; operator docs and verification receipt.

1. Reproduce the existing visible click path in WebKit and Chromium before changing product code. Identify event/focus ordering rather than changing handlers speculatively.
2. Apply the smallest shared popup correction and render existing IntegrationsPanel from Settings organization section. Keep capabilities and existing routes.
3. Run focused cross-engine browser tests and lint/type/format checks; independent review, publish frozen frontend only, compare public artifact bytes, local conventional commit. Stop when public visible navigation and Settings token issuance pass isolated fixtures. Original Task7/main/Hermes gates remain open.

## Results

WebKit RED reproduced the original Help click failure and missing Settings entry. WebKit and Chromium GREEN:17/17each. Lint/types/format/token checks and allowlisted145-input production build passed. Independent compiled WebKit review confirmed desktop PT/mobile EN paths, viewport fit, focus/keyboard/dismissal and6artifact hashes. An access-control diagnostic occurred only while unloading a fixture document with page.goto; the same-document SPA flow had zero pageerrors and no raw error visible. No blocking finding. Publication and committed-source checks are recorded in the [delivery receipt](../../verification/agent-platform/settings-integration-navigation-2026-10-21.md).
