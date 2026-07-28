import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  DISH_CATEGORIES,
  EFFORT_LEVELS,
  INGREDIENT_CATEGORIES,
  type DishCategory,
  type Effort,
  type MeasureUnit,
  type Recipe,
  type RecipeIngredientLine,
  type RecipeKind,
  type RecipeStep,
  type TimeUnit,
} from '@/domain/types'
import { recipeKindOf, uid } from '@/domain/kitchen'
import {
  allowedMeasureUnits,
  canUseMeasureUnit,
  fromStockAmount,
  measureUnitOf,
  toStockAmount,
} from '@/domain/measures'
import {
  isStagedRecipe,
  leadDaysAhead,
  stageDaysAheadList,
  stageOfLine,
  stageOfStep,
  stageOptions,
  stageLabel,
} from '@/domain/stages'
import { ImageUploadField } from '@/shared/ImageUploadField'
import { RecipeStorageFields } from '@/shared/RecipeStoragePanel'
import { groupRecipeSteps, recipeTips, DEFAULT_SUBRECIPE, ensureStepGroups } from '@/domain/recipeMath'
import { SearchPickerSheet } from '@/shared/SearchPickerSheet'
import { Button, Field, PageHeader, inputClass } from '@/shared/ui'

/** Earliest stage first, preserving each step’s relative order inside its stage. */
function orderStepsByStage(steps: RecipeStep[]): RecipeStep[] {
  return [...steps]
    .map((step, index) => ({ step, index }))
    .sort((a, b) => {
      const stageDiff = stageOfStep(b.step) - stageOfStep(a.step)
      if (stageDiff !== 0) return stageDiff
      return a.index - b.index
    })
    .map(({ step }) => step)
}

export function RecipeEditPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const recipeId = isNew ? null : Number(id)
  const navigate = useNavigate()
  const existing = useLiveQuery(
    () => (recipeId ? db.recipes.get(recipeId) : undefined),
    [recipeId],
  )
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []) ?? []

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState('')
  const [tips, setTips] = useState<string[]>([''])
  const [recipeKind, setRecipeKind] = useState<RecipeKind>('dish')
  const [yieldIngredientId, setYieldIngredientId] = useState(0)
  const [yieldAmount, setYieldAmount] = useState(0)
  const [category, setCategory] = useState<DishCategory>('other')
  const [effort, setEffort] = useState<Effort>('easy')
  const [portions, setPortions] = useState(4)
  const [storageDays, setStorageDays] = useState(3)
  const [storageEnv, setStorageEnv] = useState<'fridge' | 'freezer' | 'room'>('fridge')
  const [storageInstructions, setStorageInstructions] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>()
  const [lines, setLines] = useState<RecipeIngredientLine[]>([])
  const [steps, setSteps] = useState<RecipeStep[]>([
    { id: uid(), description: '', requiresTimer: false, group: DEFAULT_SUBRECIPE },
  ])
  /** Local subrecipe title drafts while typing (keyed by first step id). */
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({})
  /** null = closed; 'add' = append; number = replace line at index */
  const [ingredientPicker, setIngredientPicker] = useState<'add' | number | null>(null)

  const yieldIng = ingredients.find((i) => i.id === yieldIngredientId)
  const isPrep = recipeKind === 'prep'

  const draft = { steps, ingredients: lines }
  const multiStage = isStagedRecipe(draft)
  const stagesPresent = stageDaysAheadList(draft)
  const lead = leadDaysAhead(draft)

  const ingredientPickerItems = useMemo(
    () =>
      ingredients
        .filter((i) => i.id != null)
        .map((i) => {
          const cat = INGREDIENT_CATEGORIES.find((c) => c.id === i.category)?.label
          return {
            id: i.id!,
            label: i.name,
            detail: `${cat ?? i.category} · ${i.unit}`,
            group: i.category,
            searchText: `${i.name} ${cat ?? ''} ${i.unit}`,
          }
        }),
    [ingredients],
  )

  function applyPickedIngredient(ingredientId: number) {
    const nextIng = ingredients.find((i) => i.id === ingredientId)
    if (!nextIng?.id) return
    if (ingredientPicker === 'add') {
      setLines([...lines, { ingredientId: nextIng.id, amount: 0, measureUnit: nextIng.unit }])
      return
    }
    if (typeof ingredientPicker === 'number') {
      const idx = ingredientPicker
      const line = lines[idx]
      if (!line) return
      const next = [...lines]
      next[idx] = {
        ...line,
        ingredientId: nextIng.id,
        measureUnit: nextIng.unit,
      }
      setLines(next)
    }
  }

  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setDescription(existing.description)
    setSource(existing.source ?? '')
    setTips(() => {
      const list = recipeTips(existing)
      return list.length > 0 ? list : ['']
    })
    setRecipeKind(recipeKindOf(existing))
    setYieldIngredientId(existing.yieldIngredientId ?? ingredients[0]?.id ?? 0)
    setYieldAmount(existing.yieldAmount ?? 0)
    setCategory(existing.category)
    setEffort(existing.effort)
    setPortions(existing.portions)
    setStorageDays(existing.storageDays)
    setStorageEnv(existing.storageEnv)
    setStorageInstructions(existing.storageInstructions ?? '')
    setImageDataUrl(existing.imageDataUrl)
    setLines(existing.ingredients)
    setSteps(
      existing.steps.length > 0
        ? ensureStepGroups(existing.steps)
        : [{ id: uid(), description: '', requiresTimer: false, group: DEFAULT_SUBRECIPE }],
    )
  }, [existing, ingredients])

  async function save() {
    const normalizedSteps = ensureStepGroups(steps)
    if (!name.trim() || lines.length === 0 || normalizedSteps.every((s) => !s.description.trim())) {
      alert('Name, at least one ingredient, and one step are required.')
      return
    }
    if (normalizedSteps.some((s) => !s.group?.trim())) {
      alert('Every step must belong to a named subrecipe.')
      return
    }
    if (isPrep && (!yieldIngredientId || yieldAmount <= 0)) {
      alert('Prep recipes need a pantry ingredient and yield amount.')
      return
    }
    for (const line of lines) {
      const ing = ingredients.find((i) => i.id === line.ingredientId)
      if (!ing) {
        alert('Every line needs a valid ingredient.')
        return
      }
      const measure = measureUnitOf(line, ing)
      if (!canUseMeasureUnit(ing, measure)) {
        alert(
          `${ing.name}: ${measure} needs a density (set grams per tablespoon on the ingredient) or use ${ing.unit}.`,
        )
        return
      }
      if (line.amount <= 0) {
        alert(`${ing.name}: amount must be greater than zero.`)
        return
      }
    }
    const now = new Date().toISOString()
    const payload: Omit<Recipe, 'id'> = {
      name: name.trim(),
      description: description.trim(),
      source: source.trim() || undefined,
      tips: tips.map((t) => t.trim()).filter(Boolean),
      tip: '',
      recipeKind,
      yieldIngredientId: isPrep ? yieldIngredientId : undefined,
      yieldAmount: isPrep ? yieldAmount : undefined,
      category,
      effort,
      portions,
      storageInstructions: storageInstructions.trim() || undefined,
      storageDays,
      storageEnv,
      imageDataUrl,
      ingredients: lines.map((line) => {
        const ing = ingredients.find((i) => i.id === line.ingredientId)!
        const measureUnit = measureUnitOf(line, ing)
        const daysAhead = stageOfLine(line)
        return {
          ingredientId: line.ingredientId,
          amount: line.amount,
          measureUnit: measureUnit === ing.unit ? undefined : measureUnit,
          daysAhead: daysAhead > 0 ? daysAhead : undefined,
        }
      }),
      steps: orderStepsByStage(normalizedSteps.filter((s) => s.description.trim())).map((s) => {
        const daysAhead = stageOfStep(s)
        return {
          ...s,
          group: s.group!.trim(),
          daysAhead: daysAhead > 0 ? daysAhead : undefined,
        }
      }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      seeded: existing?.seeded,
    }
    if (recipeId) {
      await db.recipes.update(recipeId, payload)
      navigate(`/recipes/${recipeId}`)
    } else {
      const newId = await db.recipes.add(payload)
      navigate(`/recipes/${newId}`)
    }
  }

  return (
    <div>
      <PageHeader title={isNew ? 'New recipe' : 'Edit recipe'} />
      <div className="space-y-4">
        <ImageUploadField value={imageDataUrl} onChange={setImageDataUrl} />
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Short description">
          <textarea
            className={inputClass}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Source (optional)"
          hint="Cookbook, friend, URL, or wherever you found this recipe."
        >
          <input
            className={inputClass}
            value={source}
            placeholder="e.g. cookbook, friend, https://…"
            onChange={(e) => setSource(e.target.value)}
          />
        </Field>
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg">Chef’s tips</h2>
            <Button
              variant="secondary"
              onClick={() => setTips([...tips, ''])}
            >
              Add tip
            </Button>
          </div>
          <div className="space-y-2">
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Field label={`Tip ${idx + 1}`}>
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={tip}
                      onChange={(e) => {
                        const next = [...tips]
                        next[idx] = e.target.value
                        setTips(next)
                      }}
                    />
                  </Field>
                </div>
                {tips.length > 1 ? (
                  <Button
                    variant="ghost"
                    className="mt-7 shrink-0"
                    onClick={() => setTips(tips.filter((_, i) => i !== idx))}
                  >
                    ×
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <Field label="Recipe kind">
          <select
            className={inputClass}
            value={recipeKind}
            onChange={(e) => {
              const kind = e.target.value as RecipeKind
              setRecipeKind(kind)
              if (kind === 'prep') {
                setStorageDays((d) => (d < 7 ? 14 : d))
                if (!yieldIngredientId && ingredients[0]?.id) {
                  setYieldIngredientId(ingredients[0].id)
                }
              }
            }}
          >
            <option value="dish">Dish — Ready to eat / meals</option>
            <option value="prep">Prep — adds to pantry (sauces, dashi…)</option>
          </select>
        </Field>
        {isPrep ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-accent/25 bg-accent/5 p-3">
            <Field label="Yields ingredient">
              <select
                className={inputClass}
                value={yieldIngredientId}
                onChange={(e) => setYieldIngredientId(Number(e.target.value))}
              >
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Yield amount (${yieldIng?.unit ?? 'unit'})`}>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={yieldAmount}
                onChange={(e) => setYieldAmount(Number(e.target.value))}
              />
            </Field>
            <p className="col-span-2 text-xs text-ink-muted">
              When you finish cooking, this amount (scaled by batches) is added to the pantry as
              Homemade stock.
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={isPrep ? 'Category' : 'Dish category'}>
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as DishCategory)}
            >
              {DISH_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Effort">
            <select
              className={inputClass}
              value={effort}
              onChange={(e) => setEffort(e.target.value as Effort)}
            >
              {EFFORT_LEVELS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={isPrep ? 'Batches (scale)' : 'Portions'}>
            <input
              className={inputClass}
              type="number"
              min={1}
              value={portions}
              onChange={(e) => setPortions(Number(e.target.value))}
            />
          </Field>
        </div>

        <RecipeStorageFields
          storageDays={storageDays}
          storageEnv={storageEnv}
          storageInstructions={storageInstructions}
          onStorageDaysChange={setStorageDays}
          onStorageEnvChange={setStorageEnv}
          onStorageInstructionsChange={setStorageInstructions}
        />

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg">Ingredients</h2>
            <Button
              variant="secondary"
              disabled={ingredients.length === 0}
              onClick={() => setIngredientPicker('add')}
            >
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line, idx) => {
              const ing = ingredients.find((i) => i.id === line.ingredientId)
              const measure = measureUnitOf(line, ing)
              const measureOptions = ing ? allowedMeasureUnits(ing) : (['g'] as MeasureUnit[])
              const displayAmount = ing
                ? fromStockAmount(line.amount, measure, ing)
                : line.amount
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIngredientPicker(idx)}
                      className={`${inputClass} min-w-0 flex-1 text-left`}
                    >
                      <span className="block truncate font-medium">
                        {ing?.name ?? 'Choose ingredient'}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {ing
                          ? `${INGREDIENT_CATEGORIES.find((c) => c.id === ing.category)?.label ?? ing.category} · tap to change`
                          : 'Tap to search'}
                      </span>
                    </button>
                    <input
                      className={`${inputClass} w-20`}
                      type="number"
                      min={0}
                      step="0.1"
                      value={displayAmount}
                      onChange={(e) => {
                        if (!ing) return
                        const measureAmount = Number(e.target.value)
                        const next = [...lines]
                        try {
                          next[idx] = {
                            ...line,
                            amount: toStockAmount(measureAmount, measure, ing),
                            measureUnit: measure === ing.unit ? undefined : measure,
                          }
                          setLines(next)
                        } catch {
                          /* ignore while typing invalid spoon without density */
                        }
                      }}
                    />
                    <select
                      className={`${inputClass} w-24`}
                      value={measure}
                      onChange={(e) => {
                        if (!ing) return
                        const nextMeasure = e.target.value as MeasureUnit
                        const shown = fromStockAmount(line.amount, measure, ing)
                        const next = [...lines]
                        try {
                          next[idx] = {
                            ...line,
                            amount: toStockAmount(shown, nextMeasure, ing),
                            measureUnit: nextMeasure === ing.unit ? undefined : nextMeasure,
                          }
                          setLines(next)
                        } catch (err) {
                          alert(err instanceof Error ? err.message : 'Cannot convert unit')
                        }
                      }}
                    >
                      {measureOptions.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                    >
                      ×
                    </Button>
                  </div>
                  {multiStage ? (
                    <label className="flex items-center gap-2 text-xs text-ink-muted">
                      Needed
                      <select
                        className={`${inputClass} w-40 py-1 text-xs`}
                        value={stageOfLine(line)}
                        onChange={(e) => {
                          const daysAhead = Number(e.target.value)
                          const next = [...lines]
                          next[idx] = {
                            ...line,
                            daysAhead: daysAhead > 0 ? daysAhead : undefined,
                          }
                          setLines(next)
                        }}
                      >
                        {stagesPresent.map((d) => (
                          <option key={d} value={d}>
                            {stageLabel(d)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {ing && measure !== ing.unit ? (
                    <p className="text-xs text-ink-muted">
                      Stock: {line.amount} {ing.unit}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Steps</h2>
            <Button
              variant="secondary"
              onClick={() => {
                const name = prompt('Subrecipe name (e.g. Rice, Sauce, Garnish)')
                if (name === null) return
                const group = name.trim()
                if (!group) {
                  alert('Subrecipe name is required.')
                  return
                }
                setSteps([
                  ...ensureStepGroups(steps),
                  { id: uid(), description: '', requiresTimer: false, group },
                ])
              }}
            >
              Add subrecipe
            </Button>
          </div>
          <p className="mb-3 text-xs text-ink-muted">
            Every step belongs to a named subrecipe (rice, sauce, garnish…). Use “When” for work
            that happens on an earlier day — planning the cook then also books a prep session for
            it. Add steps inside each subrecipe.
          </p>
          {multiStage ? (
            <p className="mb-3 rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-ink-muted">
              Spans {lead + 1} days — starts {lead} day{lead === 1 ? '' : 's'} before the cook.
            </p>
          ) : null}
          <div className="space-y-4">
            {groupRecipeSteps(steps).map((section) => {
              // Stable key: first step id only — must NOT include the editable name.
              const sectionKey = section.steps[0]?.id ?? section.name
              const draftName = groupDrafts[sectionKey]
              const displayName = draftName ?? section.name
              return (
              <div
                key={sectionKey}
                className="space-y-3 rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 p-3"
              >
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label="Subrecipe name">
                      <input
                        className={inputClass}
                        value={displayName}
                        onChange={(e) => {
                          const nextName = e.target.value
                          setGroupDrafts((prev) => ({ ...prev, [sectionKey]: nextName }))
                        }}
                        onBlur={() => {
                          const ids = new Set(section.steps.map((s) => s.id))
                          const trimmed =
                            (groupDrafts[sectionKey] ?? section.name).trim() || DEFAULT_SUBRECIPE
                          setSteps(
                            steps.map((s) =>
                              ids.has(s.id)
                                ? { ...s, group: trimmed }
                                : { ...s, group: s.group?.trim() || DEFAULT_SUBRECIPE },
                            ),
                          )
                          setGroupDrafts((prev) => {
                            const next = { ...prev }
                            delete next[sectionKey]
                            return next
                          })
                        }}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="!py-1 !text-xs"
                      onClick={() => {
                        const lastInSection = section.steps[section.steps.length - 1]
                        const insertAfter = lastInSection
                          ? steps.findIndex((s) => s.id === lastInSection.id)
                          : steps.length - 1
                        const groupName =
                          (groupDrafts[sectionKey] ?? section.name).trim() || DEFAULT_SUBRECIPE
                        const newStep: RecipeStep = {
                          id: uid(),
                          description: '',
                          requiresTimer: false,
                          group: groupName,
                          daysAhead: lastInSection?.daysAhead,
                        }
                        const next = [...ensureStepGroups(steps)]
                        next.splice(Math.max(insertAfter, -1) + 1, 0, newStep)
                        setSteps(next)
                      }}
                    >
                      Add step
                    </Button>
                    <Button
                      variant="ghost"
                      className="!py-1 !text-xs"
                      onClick={() => {
                        const ids = new Set(section.steps.map((s) => s.id))
                        const remaining = ensureStepGroups(steps).filter((s) => !ids.has(s.id))
                        setGroupDrafts((prev) => {
                          const next = { ...prev }
                          delete next[sectionKey]
                          return next
                        })
                        if (remaining.length === 0) {
                          setSteps([
                            {
                              id: uid(),
                              description: '',
                              requiresTimer: false,
                              group: DEFAULT_SUBRECIPE,
                            },
                          ])
                          return
                        }
                        setSteps(remaining)
                      }}
                    >
                      Remove subrecipe
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-ink-muted">
                  {section.steps.length} step{section.steps.length === 1 ? '' : 's'}
                </p>
                {section.steps.map((step, localIdx) => {
                  const idx = steps.findIndex((s) => s.id === step.id)
                  return (
                    <div key={step.id} className="rounded-lg border border-line bg-paper-elevated p-3">
                      <Field label="When">
                        <select
                          className={inputClass}
                          value={stageOfStep(step)}
                          onChange={(e) => {
                            const daysAhead = Number(e.target.value)
                            const next = [...steps]
                            next[idx] = {
                              ...step,
                              daysAhead: daysAhead > 0 ? daysAhead : undefined,
                            }
                            setSteps(next)
                          }}
                        >
                          {stageOptions().map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={`${displayName} · step ${localIdx + 1}`}>
                        <textarea
                          className={inputClass}
                          rows={2}
                          value={step.description}
                          onChange={(e) => {
                            const next = [...steps]
                            next[idx] = { ...step, description: e.target.value }
                            setSteps(next)
                          }}
                        />
                      </Field>
                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={step.requiresTimer}
                          onChange={(e) => {
                            const next = [...steps]
                            next[idx] = {
                              ...step,
                              requiresTimer: e.target.checked,
                              timerDuration: e.target.checked ? step.timerDuration ?? 5 : undefined,
                              timerUnit: e.target.checked ? step.timerUnit ?? 'minutes' : undefined,
                            }
                            setSteps(next)
                          }}
                        />
                        Requires timer
                      </label>
                      {step.requiresTimer ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            className={inputClass}
                            type="number"
                            value={step.timerDuration ?? 0}
                            onChange={(e) => {
                              const next = [...steps]
                              next[idx] = { ...step, timerDuration: Number(e.target.value) }
                              setSteps(next)
                            }}
                          />
                          <select
                            className={inputClass}
                            value={step.timerUnit ?? 'minutes'}
                            onChange={(e) => {
                              const next = [...steps]
                              next[idx] = { ...step, timerUnit: e.target.value as TimeUnit }
                              setSteps(next)
                            }}
                          >
                            <option value="seconds">seconds</option>
                            <option value="minutes">minutes</option>
                            <option value="hours">hours</option>
                          </select>
                        </div>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="mt-1"
                        onClick={() => {
                          const remaining = steps.filter((_, i) => i !== idx)
                          if (remaining.length === 0) {
                            setSteps([
                              {
                                id: uid(),
                                description: '',
                                requiresTimer: false,
                                group:
                                  (groupDrafts[sectionKey] ?? section.name).trim() ||
                                  DEFAULT_SUBRECIPE,
                              },
                            ])
                            return
                          }
                          setSteps(ensureStepGroups(remaining))
                        }}
                      >
                        Remove step
                      </Button>
                    </div>
                  )
                })}
              </div>
              )
            })}
          </div>
        </section>

        <Button className="w-full" onClick={() => void save()}>
          Save recipe
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </div>

      <SearchPickerSheet
        open={ingredientPicker != null}
        title={ingredientPicker === 'add' ? 'Add ingredient' : 'Change ingredient'}
        items={ingredientPickerItems}
        groups={INGREDIENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
        selectedId={
          typeof ingredientPicker === 'number' ? lines[ingredientPicker]?.ingredientId : null
        }
        emptyTitle="No ingredients found"
        emptyBody="Try another search or category."
        onClose={() => setIngredientPicker(null)}
        onSelect={applyPickedIngredient}
      />
    </div>
  )
}
