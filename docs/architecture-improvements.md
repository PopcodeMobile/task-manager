# Architecture review: implemented improvements

The improve-codebase-architecture review identified boundaries where callers had to know
too much about storage, language, styling or asynchronous UI state. This change implements
the following improvements while retaining the existing vanilla JavaScript renderer.

| Finding                                                  | Implementation                                                                | Proof                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Global snapshot mixes organizations and persistence      | Local/Supabase adapters and workspace controller; migrate legacy data once    | Adapter, migration, isolation and revision tests            |
| Simulated login and membership imply authorization       | Real Supabase Auth, membership tables, RLS, restricted transactional RPCs     | PGlite, PostgreSQL and local Supabase SDK checks            |
| Delayed callbacks and undo can affect another workspace  | Controller epoch/generation, scoped undo/upload callbacks, reset transient UI | Switch, reload/logout and in-flight-save regression tests   |
| Interface strings and date formatting are distributed    | Locale service, two complete catalogs, canonical domain IDs, localized seed   | Catalog coverage and browser route checks in both languages |
| Token catalog diverges from actual controls              | Shared token/accent inventory, consolidated themes, migrated CSS/templates    | Token audit and browser override test                       |
| Feature registration couples rendering to action loading | Explicit handler registry and separate navigation metadata                    | Full route/build and interaction tests                      |
| Deletion and file changes duplicate related-record rules | Pure task/project/file operations                                             | Cascade and preservation tests                              |
| Shared content enters HTML strings unsafely              | Escaped text/attributes, rich-text sanitizer, payload structural validation   | Malicious-payload and browser XSS regressions               |

The compatibility store remains the UI's access point. Repository/controller code hides
storage and concurrency details from renderers. This avoids replacing the entire UI while
creating a tested boundary for later normalized database storage.

See the [storage ADR](adr/0001-workspace-storage.md) for deliberate limits: snapshot conflicts,
5 MB payloads, workspace-wide visibility, administrative membership provisioning, and no
cloud file storage or realtime merging yet. Remote activation awaits account configuration.
