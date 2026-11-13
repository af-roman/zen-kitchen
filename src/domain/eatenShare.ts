import type { EatenShare } from './types'

/** Rough household shares. Exact absorption depends on the dish; these avoid typing a gram each time. */
const FACTOR: Record<EatenShare, number> = {
  all: 1,
  coating: 0.25,
  trace: 0.1,
  none: 0,
}

export const EATEN_SHARE_OPTIONS: {
  id: EatenShare
  label: string
  short: string
  detail: string
}[] = [
  {
    id: 'all',
    label: 'All of it is eaten',
    short: 'All eaten',
    detail: 'The full amount is in the dish. Rice, fish, vegetables, a sauce you pour on.',
  },
  {
    id: 'coating',
    label: 'A coating is eaten',
    short: 'Coating eaten',
    detail:
      'About a quarter stays on the food. Miso left on salmon, panko that clings, oil from a pan fry.',
  },
  {
    id: 'trace',
    label: 'A trace is eaten',
    short: 'Trace eaten',
    detail:
      'About a tenth stays. Oil a deep-fry absorbs, marinade wiped thin, a little of what you steep for dashi.',
  },
  {
    id: 'none',
    label: 'None of it is eaten',
    short: 'Not eaten',
    detail:
      'Lifted out or left in the tray. Kombu, katsuobushi, ginger you scoop out, flour you do not use. The pantry still uses the full amount.',
  },
]

export function eatenFactor(share: EatenShare | undefined): number {
  return FACTOR[share ?? 'all']
}

export function eatenShareOf(share: EatenShare | undefined): EatenShare {
  return share ?? 'all'
}

export function eatenShareOption(share: EatenShare | undefined) {
  const id = eatenShareOf(share)
  return EATEN_SHARE_OPTIONS.find((option) => option.id === id) ?? EATEN_SHARE_OPTIONS[0]!
}

/** Weighted share when several recipe lines use the same ingredient. Missing lines count in full. */
export function eatenFactorForIngredient(
  lines: { ingredientId: number; amount: number; eatenShare?: EatenShare }[],
  ingredientId: number,
): number {
  const matched = lines.filter((line) => line.ingredientId === ingredientId)
  if (matched.length === 0) return 1
  const total = matched.reduce((sum, line) => sum + Math.max(0, line.amount), 0)
  if (total <= 0) return eatenFactor(matched[0]?.eatenShare)
  const eaten = matched.reduce(
    (sum, line) => sum + Math.max(0, line.amount) * eatenFactor(line.eatenShare),
    0,
  )
  return eaten / total
}

/** One label when every matching line agrees. Undefined when the whole amount is eaten. */
export function eatenShareNote(
  lines: { ingredientId: number; eatenShare?: EatenShare }[],
  ingredientId: number,
): string | undefined {
  const matched = lines.filter((line) => line.ingredientId === ingredientId)
  if (matched.length === 0) return undefined
  const shares = new Set(matched.map((line) => eatenShareOf(line.eatenShare)))
  if (shares.size === 1) {
    const only = [...shares][0]!
    if (only === 'all') return undefined
    return `${eatenShareOption(only).short} · pantry still uses the full amount`
  }
  return 'Partly eaten · pantry still uses the full amount'
}
