export type ExtractedRecipe = {
  name: string
  description: string
  recipeYield?: string | number
  totalTime?: string
  recipeIngredient: string[]
  recipeInstructions: string[]
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function typeTokens(type: unknown): string[] {
  return asArray(type).map((t) => String(t).toLowerCase())
}

function hasType(type: unknown, needle: string): boolean {
  const n = needle.toLowerCase()
  return typeTokens(type).some((t) => t === n || t.endsWith(`/${n}`))
}

function isRecipeType(type: unknown): boolean {
  return hasType(type, 'recipe')
}

function stripHtml(input: string): string {
  const withBreaks = input
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
}

function splitInstructionBlob(text: string): string[] {
  const plain = /</.test(text) ? stripHtml(text) : text.trim()
  if (!plain) return []

  const numbered = plain
    .split(/(?:^|\n)\s*\d+[.)]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (numbered.length > 1) return numbered

  const lines = plain
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length > 1) return lines

  return [plain]
}

type RankedStep = { position: number; text: string }

function collectSteps(value: unknown, out: RankedStep[], fallbackPosition: number): number {
  let pos = fallbackPosition
  for (const item of asArray(value)) {
    if (typeof item === 'string') {
      for (const part of splitInstructionBlob(item)) {
        out.push({ position: pos++, text: part })
      }
      continue
    }
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>

    if (hasType(obj['@type'], 'HowToSection') || hasType(obj['@type'], 'ItemList')) {
      pos = collectSteps(obj.itemListElement ?? obj.steps, out, pos)
      continue
    }

    if (hasType(obj['@type'], 'HowToStep') || hasType(obj['@type'], 'HowToDirection')) {
      const rawText = obj.text ?? obj.name ?? obj.description
      const text =
        typeof rawText === 'string' ? stripHtml(rawText).trim() || rawText.trim() : ''
      const explicit =
        typeof obj.position === 'number'
          ? obj.position
          : typeof obj.position === 'string'
            ? Number(obj.position)
            : NaN
      if (text) {
        out.push({
          position: Number.isFinite(explicit) ? explicit : pos++,
          text,
        })
      }
      if (obj.itemListElement) pos = collectSteps(obj.itemListElement, out, pos)
      continue
    }

    const rawText = obj.text ?? obj.name
    if (typeof rawText === 'string' && rawText.trim()) {
      for (const part of splitInstructionBlob(rawText)) {
        out.push({ position: pos++, text: part })
      }
    }
    if (obj.itemListElement) pos = collectSteps(obj.itemListElement, out, pos)
  }
  return pos
}

function flattenInstructions(value: unknown): string[] {
  const ranked: RankedStep[] = []
  collectSteps(value, ranked, 1)
  ranked.sort((a, b) => a.position - b.position)
  const out: string[] = []
  for (const step of ranked) {
    if (out[out.length - 1] === step.text) continue
    out.push(step.text)
  }
  return out
}

function normalizeRecipe(node: Record<string, unknown>): ExtractedRecipe | null {
  if (!isRecipeType(node['@type'])) return null
  const name = typeof node.name === 'string' ? node.name.trim() : ''
  const ingredients = asArray(node.recipeIngredient)
    .map((x) => {
      if (typeof x === 'string') return x.trim()
      if (x && typeof x === 'object') {
        const obj = x as Record<string, unknown>
        if (typeof obj.text === 'string') return obj.text.trim()
        if (typeof obj.name === 'string') return obj.name.trim()
      }
      return ''
    })
    .filter(Boolean)
  const instructions = flattenInstructions(node.recipeInstructions)
  if (!name || ingredients.length === 0) return null
  return {
    name,
    description: typeof node.description === 'string' ? stripHtml(node.description).trim() : '',
    recipeYield: (node.recipeYield as string | number | undefined) ?? undefined,
    totalTime: typeof node.totalTime === 'string' ? node.totalTime : undefined,
    recipeIngredient: ingredients,
    recipeInstructions: instructions,
  }
}

function walk(node: unknown, out: ExtractedRecipe[]) {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out)
    return
  }
  if (typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  const recipe = normalizeRecipe(obj)
  if (recipe) out.push(recipe)
  if (obj['@graph']) walk(obj['@graph'], out)
  for (const [key, value] of Object.entries(obj)) {
    if (key === '@graph') continue
    if (value && typeof value === 'object') walk(value, out)
  }
}

/** Parse HTML for usable schema.org Recipe JSON-LD. */
export function extractRecipeFromHtml(html: string): ExtractedRecipe {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')]
  const found: ExtractedRecipe[] = []

  for (const script of scripts) {
    const raw = script.textContent?.trim()
    if (!raw) continue
    try {
      walk(JSON.parse(raw), found)
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }

  found.sort((a, b) => b.recipeInstructions.length - a.recipeInstructions.length)

  if (found.length === 0) {
    throw new Error('No usable schema.org Recipe JSON-LD found (need name and ingredients).')
  }
  return found[0]!
}

export function parseYieldPortions(yieldValue: string | number | undefined): number {
  if (typeof yieldValue === 'number' && Number.isFinite(yieldValue) && yieldValue > 0) {
    return Math.round(yieldValue)
  }
  if (typeof yieldValue === 'string') {
    const m = yieldValue.match(/(\d+(\.\d+)?)/)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return Math.max(1, Math.round(n))
    }
  }
  return 4
}
