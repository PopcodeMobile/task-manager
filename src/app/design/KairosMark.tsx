/** Compact K shared by the workspace badge and favicon. */
export function KairosMark() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
      <path d="M8 6h5v8l7-8h6l-9 10 9 10h-6l-7-8v8H8Z" fill="currentColor" />
    </svg>
  );
}
export function KairosLogo({ height = 30 }: { height?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: height,
        lineHeight: 'var(--lh-tight)',
        fontWeight: 'var(--fw-semibold)',
        letterSpacing: 'var(--tracking-heading)',
      }}
    >
      Kairos
    </span>
  );
}
