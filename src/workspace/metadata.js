export function workspaceSlug(value) {
  return (
    String(value || '')
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 120)
      .replace(/^-+|-+$/g, '') || 'workspace'
  );
}
