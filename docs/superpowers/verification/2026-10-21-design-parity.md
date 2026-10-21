# Original design restoration verification

The React migration had retained features while replacing the original page composition with generic controls and layouts. This correction restores the upstream visual structure in the existing React, TypeScript and shadcn/Radix application. It adds no dependencies and changes no database schema, API, MCP or hosted configuration. Visual and functional acceptance is complete within the scope recorded below.

## Reference and acceptance contract

The supplied original application and screenshots are authoritative. The upstream source is pinned to `gr8rstudio/gr8r-studio` commit `904205c626918ee96054eb35495c394a60c0c601`. Comparable captures use the same synthetic data, fixed time `2026-10-21T08:30:00Z`, English, `America/Maceio`, reduced motion, dark/light themes and desktop1440×1000/mobile390×844 viewports.

The matrix comprises196 base captures, covering49 routes/surfaces in four variants, and102 extra-state captures. It includes Home, Overview, project collections, eight project tabs, task views, calendars/timelines, Files, Inbox, people, teams, all21 Settings subsections, drawers, property pickers and create/edit/save/share overlays. Original screenshots are immutable. Unmasked pixel differences are diagnostic, without an invented acceptance tolerance.

## Changes

- Restored original sidebar groups, header, typography, compact controls, joined statistics, dashboard columns, portfolio tables, project cards, status indicators and avatar treatments.
- Restored task list/board/table density, project tabs, calendars, timelines, file previews and original drawer/modal composition, while retaining current authorized data and commands.
- Adapted React and shadcn controls to the original visual system, including keyboard access, popup focus, mobile sheets and translated controls.
- Preserved drafts, CAS/retry identities, reservation guards, pagination, literal user content and current agent/integration surfaces.
- Fixed repository activation before child reads. The unchanged cold production Table test failed before this fix and passed afterward, including preference persistence on reload. Separate source review checked cancellation and identity boundaries.
- Retained saved appearance and search history through the existing read-only preference boundary. Rich text accepts inert `h4` headings through the existing sanitizer.

## Final evidence

| Gate                                                                      | Result                                                                                                        | Local evidence                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full check: lint, types, formatting, Node tests, tokens, production build | PASS;285 tests,0 skipped                                                                                      | `/tmp/task-manager-design-check-final10-retry.log`                                                                                                                                      |
| Design browser regression suite                                           | PASS;71 tests                                                                                                 | `/tmp/task-design-final-round10-green.log`                                                                                                                                              |
| Same-source reference capture                                             | 196+102 unique captures,0 capture/page errors;125 product-file hashes unchanged                               | `/tmp/task-design-capture-final10.py`, `/tmp/task-manager-design-candidate-final10`, `/tmp/task-manager-design-extra-candidate-final10`, `/tmp/task-manager-design-source-final10.json` |
| WebKit27.2 smoke                                                          | PASS;20 cases,0 page errors or horizontal overflows; popup Escape restores focus                              | `/tmp/task-design-webkit-final10.log`, `/tmp/task-manager-design-webkit/manifest.json`                                                                                                  |
| Compiled artifact WebKit27.2 smoke                                        | PASS; the same20 cases against the production build                                                           | `/tmp/task-design-webkit-compiled-final10.log`, `/tmp/task-manager-design-webkit-compiled-final10/manifest.json`                                                                        |
| Real local OAuth consent                                                  | PASS;6 tests                                                                                                  | `/tmp/task-manager-design-final-oauth.log`                                                                                                                                              |
| Agent/cloud/cutover production browser suite                              | PASS;31 tests against the compiled cloud artifact                                                             | `/tmp/task-manager-design-final-agent-production.log`                                                                                                                                   |
| Cold production Table lifecycle regression                                | PASS; unchanged existing test after observed production failure                                               | `/tmp/task-design-cold-collection-red3-production.log`, `/tmp/task-design-cold-collection-green.log`                                                                                    |
| Local functional browser suite                                            | PASS;69 tests, including concurrency, dirty drafts, persistence, permissions and literal content              | `/tmp/task-design-local-functional-final12.log`                                                                                                                                         |
| Token rotation / original CAS / retry identity fixture                    | PASS in isolated development runtime; this test imports a source module and cannot run against static preview | `/tmp/task-design-token-rotation-dev.log`                                                                                                                                               |

The complete32 agent/cloud/cutover scenarios are covered by31 production tests plus the source-import token-rotation test in an isolated development runtime. No test is silently skipped. Final lint, typecheck, formatting and token checks also passed after all test-selector and fixture corrections; logs are `/tmp/task-design-delivery-{lint,typecheck,format-check,check-tokens}.log`.

Runtime choice is intentional: local fixtures and token rotation dynamically import source modules, so they need development serving. The bounded history assertion permits only one initial page read and is verified against production, where Strict Mode does not replay effects. An exploratory full development run also recorded four browser `PT429` read responses after235 browser RPCs in the long task-view case; setup and Node reads share its actor and240/minute quota. The specific Node error was not recorded in that run, so its cause is not asserted. The unchanged assertions passed against the compiled artifact. Quotas, timeouts and business assertions were not relaxed.

The primary [local preview](http://127.0.0.1:5182/app-local/w/w1/home) now serves `/tmp/task-manager-design-verified-local-final10`. Independent verification found the served HTML and all four JS/CSS assets byte-identical to that build. A fresh browser session opened Home, reloaded its query/hash URL, then opened and reloaded Project Table, with no page errors. The previous artifact `/tmp/task-manager-final-local-pGCafq` is retained for rollback. The same verified build is also available on the temporary review port5189.

## Review boundaries

Independent reviewers inspected every pair in the298-capture final8 matrix. A subsequent32-pair review closed mobile Table density and Timeline controls. The final10 Calendar-only correction has fresh paired captures and eight browser regressions. Independent inspection of its eight mobile Calendar pairs closed the last material finding: action overlap and missing week day-add controls. No material issue remains in that finite reviewed set. Project Calendar navigation uses an additional line to keep its actions clear of the collision present in the legacy reference.

The independent [rendered review](2026-10-21-rendered-review.md) is preserved with the correction, including case-level findings, measurements and limits.

Current normalized Files has ten distinct authorized records where legacy exposes seven. Valid additional history, custom accent preferences, new agent actions and truthful local-service limitations remain visible. These data/capability boundaries must not be hidden to obtain pixel identity. The matrix proves only its captured routes, viewports, themes and states; it does not establish identity at every scroll position or with every possible user record.

The Impeccable detector reports an inactive legacy3px Calendar side-border declaration and the retained original spring token. Computed event borders are1px on desktop and0px on mobile, including WebKit. The production build retains its existing large-chunk warning. No detector suppression or dependency migration was introduced for this task.

## Deployment boundary

This is a local visual correction on `feat/agent-platform`. Production publication and main integration remain subject to the separate platform Task7 activation gates, including the real Hermes endpoint and acceptance with two real Claude users. Local Supabase integration tests do not prove those production connections.

## Suggested team update

Recuperei o visual original do painel em React e shadcn, incluindo as telas no celular e os temas claro e escuro. Mantive as integrações de agentes e as proteções de edição. A prévia local está atualizada pra revisão. A ativação do Hermes e os testes com os Claudes dos usuários seguem na próxima etapa.
