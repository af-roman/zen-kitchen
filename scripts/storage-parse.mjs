/** Parse natural-language storage text into structured fields. */

function clampDays(n) {
  return Math.max(1, Math.min(365, Math.round(n)))
}

function parseStorageDays(text, env, fallback) {
  const t = text.toLowerCase().replace(/['']/g, "'")
  const fridgePart = t.split(/\bfreez/)[0]
  const freezerPart =
    (t.match(/\bfreez(?:er|e)\b[^.]*?(?:for|up to|within)[^.]*/i) ?? [])[0] ?? ''
  const scope =
    env === 'freezer' && freezerPart ? freezerPart : env === 'room' ? t : fridgePart

  let m = scope.match(/(?:up to |for |within |last(?:s)? for )?(\d+)\s*[–—-]\s*(\d+)\s*days?/)
  if (m) return clampDays(Math.max(Number(m[1]), Number(m[2])))

  m = scope.match(/(?:up to |for |within |last(?:s)? for )?(\d+)\s*days?/)
  if (m) return clampDays(Number(m[1]))

  m = scope.match(/(?:up to |for )?(\d+)\s*weeks?/)
  if (m) return clampDays(Number(m[1]) * 7)

  if (/(?:up to |for )?(?:a|one)\s+month/.test(scope)) return 30
  m = scope.match(/(?:up to |for )?(\d+)\s*months?/)
  if (m) return clampDays(Number(m[1]) * 30)

  if (/\b(?:a|one|1)\s+day\b/.test(scope)) return 1
  if (/\b1\s*to\s*2\s*days\b/.test(scope)) return 2
  if (/\b2\s*to\s*3\s*days\b/.test(scope)) return 3
  if (/\b3\s*to\s*4\s*days\b/.test(scope)) return 4
  if (/\bovernight\b/.test(scope)) return 1

  return fallback
}

export function parseStorageFromText(text, fallback = { storageDays: 3, storageEnv: 'fridge' }) {
  if (!text || !text.trim()) {
    return { ...fallback, storageInstructions: undefined }
  }

  const raw = text.trim()
  const t = raw.toLowerCase().replace(/['']/g, "'")

  const mentionsFridge = /\b(refrigerat|fridge)\b/.test(t)
  const mentionsFreezer = /\bfreez(?:er|e)\b/.test(t)
  const mentionsRoom =
    /\broom temperature\b/.test(t) ||
    /\bnormal room temperature\b/.test(t) ||
    /\bat room temp/.test(t) ||
    /\bcool place\b/.test(t) ||
    /\bstore at room\b/.test(t)

  let storageEnv = fallback.storageEnv
  const hasOrAlternative = /\bor\b/.test(t)
  if (mentionsFridge) {
    storageEnv = 'fridge'
  } else if (mentionsRoom && (!mentionsFreezer || hasOrAlternative)) {
    storageEnv = 'room'
  } else if (mentionsFreezer) {
    storageEnv = 'freezer'
  } else if (mentionsRoom) {
    storageEnv = 'room'
  }

  const storageDays = parseStorageDays(t, storageEnv, fallback.storageDays)

  return { storageDays, storageEnv, storageInstructions: raw }
}

export function extractStorageFromSteps(steps, fallback) {
  const isStore = (s) => s.group && /^to store$/i.test(String(s.group).trim())
  const storeSteps = steps.filter(isStore)
  if (storeSteps.length === 0) {
    return {
      steps,
      storageDays: fallback.storageDays,
      storageEnv: fallback.storageEnv,
      storageInstructions: undefined,
    }
  }

  const otherSteps = steps.filter((s) => !isStore(s))
  const text = storeSteps.map((s) => s.description).join(' ')
  const parsed = parseStorageFromText(text, fallback)
  return { steps: otherSteps, ...parsed }
}
