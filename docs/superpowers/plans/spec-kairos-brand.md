---
title: 'Rename the product to Kairos'
type: 'chore'
created: '2026-10-21'
status: 'done'
route: 'one-shot'
---

# Rename the product to Kairos

## Intent

**Problem:** The adapted application still displayed the upstream Gr8r identity. The user named this product Kairos.

**Approach:** Replace public titles, wordmarks, favicon, PT/EN copy, examples and fresh demo identity with Kairos. Preserve existing workspace content, persistence keys, event/MIME contracts, backend and production origin. The replacement wordmark uses the existing typography tokens; the compact K is shared with the favicon.

## Suggested Review Order

- [Wordmark and workspace mark](../../../src/app/design/KairosMark.tsx): new identity with existing typography tokens; [favicon](../../../public/favicon.svg) and [page title](../../../index.html).
- [Authentication](../../../src/app/auth/AuthScreen.tsx), [shell](../../../src/app/shell/WorkspacePanel.tsx) and [workspace picker](../../../src/app/workspaces/WorkspacePicker.tsx): visible brand at the entry points.
- [Fresh demo](../../../src/data/seed.js) and [PT/EN supervision copy](../../../src/locales/supervision.js): product names change while saved user organizations remain untouched.
