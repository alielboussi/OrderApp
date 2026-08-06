export function isStaleCatalogImageUrl(url?: string | null): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function resolveCatalogImageUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed || isStaleCatalogImageUrl(trimmed)) return null;
  return trimmed;
}
