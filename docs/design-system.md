# Adapt the design system

`src/styles/tokens.css` is the source of values. `src/core/design-tokens.js` lists every
public token and shared accent choice. The application's Design system page reads their
computed values and previews actual controls in the selected language and theme.

Use foundational tokens for scale and semantic tokens for meaning:

| Change             | Tokens                                                        |
| ------------------ | ------------------------------------------------------------- |
| Brand              | `--acc-l`, `--acc-d`, `--brand-bg`, `--brand-fg`              |
| Surfaces and text  | `--bg`, `--surface`, `--text`, `--text-2`, `--border`         |
| Space and corners  | `--space-unit`, `--radius-unit`, derived `--s-*` and `--r-*`  |
| Type               | `--font`, `--mono`, `--fs-*`, `--fw-*`, `--lh-*`              |
| Density and layout | `--row-h`, `--card-pad`, `--gutter`, `--side-w`, `--drawer-w` |
| Feedback           | `--success`, `--warning`, `--danger`, `--focus-ring`          |
| Motion and layers  | `--dur-*`, `--ease`, `--z-*`                                  |

Set a new brand palette in the token file and define both light and dark accent values.
`applyPrefs()` resolves the system theme and applies user accent/density choices. Runtime
preference overrides take precedence over stylesheet defaults. Keep new accents in
`ACCENTS`, which feeds settings and the catalog together.

For a component, reference semantic tokens instead of copying a literal color or spacing
value. Add a token to `TOKEN_GROUPS` whenever adding it to the public stylesheet. Run
`npm run check:tokens`: it checks inventory parity, unresolved references, colors outside
tokens, and fixed spacing/type/radius/motion declarations in CSS and inline templates.

Widths derived from data, draggable positions, table column measurements, percentages and
illustration geometry remain runtime values. User-selected project/member colors are domain
data, validated separately. The audit deliberately does not turn those into theme constants.

Validate changes on the catalog, a project board and a task drawer in both themes, with a
mobile viewport and Portuguese/English. Browser tests prove foundational radius overrides
and automatic system-theme changes propagate to controls.
