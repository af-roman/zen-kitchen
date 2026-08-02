/** Normalize a pasted YouTube URL; returns undefined if empty or not YouTube. */
export function normalizeYoutubeUrl(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withProto)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    const ok =
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    if (!ok) return undefined
    return withProto
  } catch {
    return undefined
  }
}
