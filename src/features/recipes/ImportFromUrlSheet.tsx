import { useMemo, useState } from 'react'
import { db } from '@/db/database'
import {
  INGREDIENT_CATEGORIES,
  type Ingredient,
  type MeasureUnit,
  type RecipeIngredientLine,
  type RecipeStep,
  type Unit,
} from '@/domain/types'
import { extractRecipeFromHtml, parseYieldPortions } from '@/domain/recipeImport/jsonld'
import {
  parseIngredientLine,
  suggestIngredientId,
} from '@/domain/recipeImport/parseIngredient'
import { fetchRecipePageHtml } from '@/domain/recipeImport/fetchRecipePage'
import {
  loadImportSynonyms,
  rememberImportSynonym,
} from '@/domain/recipeImport/synonyms'
import { uid } from '@/domain/kitchen'
import { mealRolesFromCategory } from '@/domain/mealRoles'
import { canUseMeasureUnit, toStockAmount } from '@/domain/measures'
import { DEFAULT_SUBRECIPE } from '@/domain/recipeMath'
import type { DishCategory, MealRole } from '@/domain/types'
import { NumberField } from '@/shared/forms'
import { SearchPickerSheet } from '@/shared/SearchPickerSheet'
import { Sheet } from '@/shared/Sheet'
import { Button, Field, inputClass } from '@/shared/ui'

type DraftLine = {
  raw: string
  parsed: boolean
  name: string
  /** Amount in `measureUnit` (e.g. 1 for "1 tbsp"), not stock ml/g. */
  amount: number
  measureUnit: MeasureUnit
  stockUnit: Unit
  ingredientId?: number
}

export type ImportedRecipeDraft = {
  name: string
  description: string
  source: string
  portions: number
  category?: DishCategory
  mealRoles?: MealRole[]
  lines: RecipeIngredientLine[]
  steps: RecipeStep[]
  quickStepsText: string
}

function guessCategory(name: string, description: string): DishCategory {
  const t = `${name} ${description}`.toLowerCase()
  if (/miso soup|スープ|汁|soup/.test(t)) return 'soup'
  if (/rice|ご飯|ごはん|gohan|donburi/.test(t)) return 'staple'
  if (/pickle|漬け|tsukemono/.test(t)) return 'side'
  if (/sauce|たれ|dressing/.test(t)) return 'sauce'
  if (/salad|和え|ohitashi|side/.test(t)) return 'side'
  return 'main'
}

export function ImportFromUrlSheet({
  open,
  onClose,
  ingredients,
  onApply,
}: {
  open: boolean
  onClose: () => void
  ingredients: Ingredient[]
  onApply: (draft: ImportedRecipeDraft) => void
}) {
  const [url, setUrl] = useState('')
  const [pasteHtml, setPasteHtml] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [synonyms, setSynonyms] = useState(loadImportSynonyms)
  const [meta, setMeta] = useState<{
    name: string
    description: string
    source: string
    portions: number
    steps: string[]
  } | null>(null)
  const [draftLines, setDraftLines] = useState<DraftLine[] | null>(null)
  const [mapLineIndex, setMapLineIndex] = useState<number | null>(null)
  /** Local stubs created during this import (id → ingredient), merged with live catalog for picks. */
  const [localStubs, setLocalStubs] = useState<Ingredient[]>([])

  const catalog = useMemo(() => {
    const byId = new Map<number, Ingredient>()
    for (const i of ingredients) if (i.id != null) byId.set(i.id, i)
    for (const i of localStubs) if (i.id != null) byId.set(i.id, i)
    return [...byId.values()]
  }, [ingredients, localStubs])

  function resetDraft() {
    setMeta(null)
    setDraftLines(null)
    setLocalStubs([])
    setMapLineIndex(null)
    setError(null)
  }

  const mapLine = mapLineIndex != null ? draftLines?.[mapLineIndex] : undefined

  function applyExtracted(html: string, sourceUrl: string) {
    const extracted = extractRecipeFromHtml(html)
    const lines: DraftLine[] = extracted.recipeIngredient.map((raw) => {
      const parsed = parseIngredientLine(raw)
      const suggested = parsed.name
        ? suggestIngredientId(parsed.name, catalog, synonyms)
        : undefined
      const measureUnit = parsed.measureUnit ?? 'g'
      const stockUnit =
        parsed.stockUnit ??
        (measureUnit === 'tsp' || measureUnit === 'tbsp' ? 'ml' : (measureUnit as Unit))
      return {
        raw,
        parsed: parsed.parsed,
        name: parsed.name || raw,
        amount: parsed.amount ?? 0,
        measureUnit,
        stockUnit,
        ingredientId: suggested,
      }
    })
    setMeta({
      name: extracted.name,
      description: extracted.description,
      source: sourceUrl,
      portions: parseYieldPortions(extracted.recipeYield),
      steps: extracted.recipeInstructions,
    })
    setDraftLines(lines)
    setError(
      extracted.recipeInstructions.length === 0
        ? 'Loaded ingredients, but no steps in structured data — add steps below or after import.'
        : null,
    )
  }

  async function onFetchUrl() {
    setBusy(true)
    setError(null)
    try {
      const page = await fetchRecipePageHtml(url)
      applyExtracted(page.html, page.finalUrl)
    } catch (e) {
      resetDraft()
      setError(e instanceof Error ? e.message : 'Fetch failed')
      setShowPaste(true)
    } finally {
      setBusy(false)
    }
  }

  function onParsePaste() {
    setBusy(true)
    setError(null)
    try {
      if (!pasteHtml.trim()) throw new Error('Paste the page HTML first.')
      applyExtracted(pasteHtml, url.trim() || 'pasted HTML')
    } catch (e) {
      resetDraft()
      setError(e instanceof Error ? e.message : 'Parse failed')
    } finally {
      setBusy(false)
    }
  }

  async function createStub(index: number) {
    if (!draftLines) return
    const line = draftLines[index]
    if (!line) return
    const now = new Date().toISOString()
    const unit: Unit = line.stockUnit
    const id = await db.ingredients.add({
      name: line.name,
      category: 'staples',
      unit,
      nutritionPer100: { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
      lowStockThreshold: 0,
      createdAt: now,
    })
    const stub: Ingredient = {
      id,
      name: line.name,
      category: 'staples',
      unit,
      nutritionPer100: { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
      lowStockThreshold: 0,
      createdAt: now,
    }
    setLocalStubs((prev) => [...prev, stub])
    setDraftLines((rows) =>
      rows?.map((r, i) => (i === index ? { ...r, ingredientId: id } : r)) ?? null,
    )
    setSynonyms((map) => rememberImportSynonym(map, line.name, stub.name))
  }

  function applyToForm() {
    if (!meta || !draftLines) return
    const unmapped = draftLines.filter((l) => l.ingredientId == null)
    if (unmapped.length) {
      setError(`${unmapped.length} ingredient line(s) still unmapped.`)
      return
    }
    for (const line of draftLines) {
      const ing = catalog.find((i) => i.id === line.ingredientId)
      if (ing) setSynonyms((map) => rememberImportSynonym(map, line.name, ing.name))
    }
    const stepDescriptions = meta.steps.map((s) => s.trim()).filter(Boolean)
    const steps: RecipeStep[] =
      stepDescriptions.length > 0
        ? stepDescriptions.map((description) => ({
            id: uid(),
            description,
            requiresTimer: false,
            group: DEFAULT_SUBRECIPE,
          }))
        : [{ id: uid(), description: '', requiresTimer: false, group: DEFAULT_SUBRECIPE }]

    const lines: RecipeIngredientLine[] = draftLines.map((l) => {
      const ing = catalog.find((i) => i.id === l.ingredientId)
      if (!ing) {
        return {
          ingredientId: l.ingredientId!,
          amount: l.amount,
          measureUnit: l.measureUnit,
        }
      }
      // Recipe form stores stock amounts; convert from the measure the user edited.
      if (canUseMeasureUnit(ing, l.measureUnit)) {
        try {
          return {
            ingredientId: l.ingredientId!,
            amount: toStockAmount(l.amount, l.measureUnit, ing),
            measureUnit: l.measureUnit === ing.unit ? undefined : l.measureUnit,
          }
        } catch {
          /* fall through */
        }
      }
      // Spoon on a solid without density, etc. — keep amount, drop incompatible measure.
      return {
        ingredientId: l.ingredientId!,
        amount: l.amount,
        measureUnit: undefined,
      }
    })

    const category = guessCategory(meta.name, meta.description)
    onApply({
      name: meta.name,
      description: meta.description,
      source: meta.source,
      portions: meta.portions,
      category,
      mealRoles: mealRolesFromCategory(category),
      lines,
      steps,
      quickStepsText: stepDescriptions.join('\n'),
    })
    setUrl('')
    setPasteHtml('')
    setShowPaste(false)
    resetDraft()
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Import from URL" wide>
      <div className="space-y-4">
        <Field label="Recipe URL" hint="Sites with schema.org Recipe JSON-LD work best.">
          <input
            className={inputClass}
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void onFetchUrl()}>
            {busy ? 'Working…' : 'Fetch & extract'}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setShowPaste((v) => !v)}
          >
            {showPaste ? 'Hide paste HTML' : 'Paste HTML instead'}
          </Button>
        </div>

        {showPaste ? (
          <Field
            label="Page HTML"
            hint="If fetch fails (phone / GitHub Pages), open the recipe → View Source → paste here."
          >
            <textarea
              className={`${inputClass} min-h-28 font-mono text-xs`}
              value={pasteHtml}
              onChange={(e) => setPasteHtml(e.target.value)}
              placeholder="<!DOCTYPE html>…"
            />
            <Button className="mt-2" variant="secondary" disabled={busy} onClick={onParsePaste}>
              Parse pasted HTML
            </Button>
          </Field>
        ) : null}

        {error ? <p className="text-sm text-warn">{error}</p> : null}

        {meta && draftLines ? (
          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-sm text-ink-muted">
              <strong className="text-ink">{meta.name}</strong>
              {' · '}
              {draftLines.length} ingredients · {meta.steps.length} steps
            </p>
            <Field
              label="Portions"
              hint="Change this if the page’s yield doesn’t match the batch you want."
            >
              <NumberField
                value={meta.portions}
                min={1}
                step={1}
                inputMode="numeric"
                onChange={(portions) => setMeta({ ...meta, portions: Math.max(1, portions) })}
              />
            </Field>
            <Field label="Source">
              <input
                className={inputClass}
                value={meta.source}
                onChange={(e) => setMeta({ ...meta, source: e.target.value })}
              />
            </Field>

            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Ingredients</p>
              <p className="text-xs text-ink-muted">
                Amounts are in the unit shown (e.g. 1 tbsp stays 1 — not converted to ml here).
              </p>
              {draftLines.map((line, index) => (
                <div
                  key={`${line.raw}-${index}`}
                  className={`rounded-lg border p-3 text-sm ${
                    line.ingredientId == null ? 'border-warn/40 bg-warn/5' : 'border-line'
                  }`}
                >
                  <p className="font-medium text-ink">{line.raw}</p>
                  {!line.parsed ? (
                    <p className="text-xs text-warn">Couldn’t parse amount/unit — check values</p>
                  ) : null}
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Amount">
                        <input
                          className={inputClass}
                          type="number"
                          min={0}
                          step="any"
                          value={line.amount}
                          onChange={(e) => {
                            const amount = Number(e.target.value)
                            setDraftLines(
                              (rows) =>
                                rows?.map((r, i) => (i === index ? { ...r, amount } : r)) ?? null,
                            )
                          }}
                        />
                      </Field>
                      <Field label="Unit">
                        <select
                          className={inputClass}
                          value={line.measureUnit}
                          onChange={(e) => {
                            const measureUnit = e.target.value as MeasureUnit
                            setDraftLines(
                              (rows) =>
                                rows?.map((r, i) => (i === index ? { ...r, measureUnit } : r)) ??
                                null,
                            )
                          }}
                        >
                          {(['g', 'ml', 'pcs', 'tsp', 'tbsp'] as MeasureUnit[]).map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <Field label="Map to">
                      <div className="flex items-stretch gap-2">
                        <button
                          type="button"
                          onClick={() => setMapLineIndex(index)}
                          className={`${inputClass} flex min-w-0 flex-1 items-center justify-between gap-2 text-left`}
                        >
                          <span
                            className={`min-w-0 truncate ${
                              line.ingredientId == null ? 'text-ink-muted' : 'text-ink'
                            }`}
                          >
                            {catalog.find((ing) => ing.id === line.ingredientId)?.name ??
                              'Choose ingredient…'}
                          </span>
                          <svg
                            viewBox="0 0 20 20"
                            className="h-4 w-4 shrink-0 text-ink-muted"
                            fill="none"
                            aria-hidden
                          >
                            <path
                              d="M5 7.5L10 12.5L15 7.5"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        {line.ingredientId != null ? (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setDraftLines(
                                (rows) =>
                                  rows?.map((r, i) =>
                                    i === index ? { ...r, ingredientId: undefined } : r,
                                  ) ?? null,
                              )
                            }
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </Field>
                    <div className="flex items-end gap-2">
                      <Button
                        variant="secondary"
                        className="min-w-0 flex-1"
                        onClick={() => void createStub(index)}
                      >
                        Create stub
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-w-0 flex-1"
                        onClick={() =>
                          setDraftLines((rows) => rows?.filter((_, i) => i !== index) ?? null)
                        }
                      >
                        Remove line
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Field label="Steps (one per line)">
              <textarea
                className={`${inputClass} min-h-36`}
                value={meta.steps.join('\n')}
                onChange={(e) => setMeta({ ...meta, steps: e.target.value.split('\n') })}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button onClick={applyToForm}>Use in recipe form</Button>
              <Button variant="secondary" onClick={resetDraft}>
                Discard extract
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <SearchPickerSheet
        open={mapLineIndex != null}
        title={mapLine ? `Map “${mapLine.name}”` : 'Map to'}
        selectedId={mapLine?.ingredientId ?? null}
        items={catalog.map((ing) => {
          const cat = INGREDIENT_CATEGORIES.find((c) => c.id === ing.category)?.label
          return {
            id: ing.id!,
            label: ing.name,
            detail: `${cat ?? ing.category} · ${ing.unit}`,
            group: ing.category,
            searchText: `${ing.name} ${cat ?? ''} ${ing.unit}`,
          }
        })}
        groups={INGREDIENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
        onClose={() => setMapLineIndex(null)}
        onSelect={(ingredientId) => {
          const index = mapLineIndex
          if (index == null) return
          setDraftLines(
            (rows) => rows?.map((r, i) => (i === index ? { ...r, ingredientId } : r)) ?? null,
          )
          setMapLineIndex(null)
        }}
      />
    </Sheet>
  )
}
