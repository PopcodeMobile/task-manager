# Adapt the design system

`src/styles/tokens.css` defines the values; `src/core/design-tokens.js` inventories all 234 public tokens and shared accents for tooling. The React Design system route previews actual buttons, fields, dialogs and six semantic color swatches in the current language/theme. It is not a full computed-value inventory; `check:tokens` checks that inventory.

| Change            | Tokens                                                        |
| ----------------- | ------------------------------------------------------------- |
| Brand             | `--acc-l`, `--acc-d`, `--brand-bg`, `--brand-fg`              |
| Surface and text  | `--bg`, `--surface`, `--text`, `--text-2`, `--border`         |
| Space and corners | `--space-unit`, `--radius-unit`, derived `--s-*`, `--r-*`     |
| Typography        | `--font`, `--mono`, `--fs-*`, `--fw-*`, `--lh-*`              |
| Density/layout    | `--row-h`, `--card-pad`, `--gutter`, `--side-w`, `--drawer-w` |
| Feedback          | `--success`, `--warning`, `--danger`, `--focus-ring`          |
| Motion/layers     | `--dur-*`, `--ease`, `--z-*`                                  |

React's App preference effect resolves system theme and applies accent/density overrides. Keep accents in `ACCENTS`, including light/dark values. The foundation remains the source for both CSS and `@theme inline` semantic Tailwind aliases in `src/app/styles.css`. A semantic alias is allowed only when its authored declaration resolves to a declared foundation variable; an arbitrary familiar shadcn name is not exempt.

For components, reference tokens instead of copying fixed colors, space, typography, radius or motion. Add public definitions to `TOKEN_GROUPS`. `npm run check:tokens` retains inventory parity, duplicate, reference, accent/status and CSS/template checks, and parses JS/JSX/TS/TSX with the installed TypeScript parser. It checks controlled `style` objects, local constants/spreads/shorthand/conditional branches, and static class sources in JSX, `cn`, `clsx` and `cva`, including variants, modifiers and arbitrary values. No shadcn/component directory is skipped.

Examples: `hover:bg-primary` requires the actual semantic alias; `p-[var(--s-4)]` and `gap-(--s-2)` require defined tokens. `hover:p-4`, palette colors, `rounded` and fixed arbitrary type/spacing values fail. Token calculations can use numeric multipliers. Static control values such as `style={{ padding: 12 }}` fail; dynamic geometry such as percentage progress, schedule positions or measured widths remains runtime data. User/project/member colors remain validated domain values; the guard does not reject every hex string in arbitrary data.

This is a static local-source guard, not evaluation of arbitrary imported/generated/runtime expressions. Business validation and browser tests cover runtime colors and geometry. Shared strict `safeRichText` sanitizes explicitly supported description/discussion HTML; ordinary content uses React escaping.

Validate changes on the catalogue, board and drawer in light/dark, mobile/desktop and PT/EN. Current browser tests assert radius overrides and system media changes reach real React controls. See [verification](verification.md) for the final interaction and visual matrix.
