/** Resolve a public asset path for the current Vite base URL. */
export function assetUrl(path: string): string {
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path
  }

  const base = import.meta.env.BASE_URL
  const normalized = path.startsWith('/') ? path.slice(1) : path
  return `${base}${normalized}`
}

/** Router basename derived from Vite base (empty at `/`). */
export function routerBasename(): string | undefined {
  const trimmed = import.meta.env.BASE_URL.replace(/\/$/, '')
  return trimmed || undefined
}
