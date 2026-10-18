import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  DISH_CATEGORIES,
  EFFORT_LEVELS,
  INGREDIENT_CATEGORIES,
  PREPARATION_TECHNIQUES,
  type DishCategory,
  type Effort,
  type MeasureUnit,
  type PreparationTechnique,
  type Recipe,
  type RecipeIngredientLine,
  type RecipeKind,
  type RecipeStep,
} from '@/domain/types'
import { recipeKindOf, uid } from '@/domain/kitchen'
import { recipeCategory, recipeTechnique } from '@/domain/dishTaxonomy'
import { readRecipeStorageDays, recipeStorageFields, recipeStorageOptions } from '@/domain/storage'
import {
  allowedMeasureUnits,
  canUseMeasureUnit,
  fromStockAmount,
  isSpoonUnit,
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
import { normalizeYoutubeUrl } from '@/domain/youtube'
import { SearchPickerSheet } from '@/shared/SearchPickerSheet'
import { appAlert, appPrompt } from '@/shared/dialog'
import { Checkbox, NumberField, SelectField } from '@/shared/forms'
import { AutoTextarea, Button, Field, PageHeader, RemoveButton, inputClass } from '@/shared/ui'

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
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [tips, setTips] = useState<string[]>([''])
  const [recipeKind, setRecipeKind] = useState<RecipeKind>('dish')
  const [yieldIngredientId, setYieldIngredientId] = useState(0)
  const [yieldAmount, setYieldAmount] = useState(0)
  const [category, setCategory] = useState<DishCategory>('other')
  const [technique, setTechnique] = useState<PreparationTechnique>('other')
  const [effort, setEffort] = useState<Effort>('easy')
  const [portions, setPortions] = useState(4)
  const [fridgeDays, setFridgeDays] = useState(3)
  const [freezerDays, setFreezerDays] = useState(0)
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
  /** New recipes start simple; edit always uses the full form. */
  const [advanced, setAdvanced] = useState(!isNew)
  const [quickStepsText, setQuickStepsText] = useState('')

  const yieldIng = ingredients.find((i) => i.id === yieldIngredientId)
  const isPrep = recipeKind === 'prep'
  const quickMode = isNew && !advanced

  function stepsFromQuickText(text: string): RecipeStep[] {
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      return [{ id: uid(), description: '', requiresTimer: false, group: DEFAULT_SUBRECIPE }]
    }
    return lines.map((description) => ({
      id: uid(),
      description,
      requiresTimer: false,
      group: DEFAULT_SUBRECIPE,
    }))
  }

  function showAdvanced() {
    if (quickStepsText.trim()) {
      setSteps(stepsFromQuickText(quickStepsText))
    }
    setAdvanced(true)
  }

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
    setYoutubeUrl(existing.youtubeUrl ?? '')
    setTips(() => {
      const list = recipeTips(existing)
      return list.length > 0 ? list : ['']
    })
    setRecipeKind(recipeKindOf(existing))
    setYieldIngredientId(existing.yieldIngredientId ?? ingredients[0]?.id ?? 0)
    setYieldAmount(existing.yieldAmount ?? 0)
    setCategory(recipeCategory(existing))
    setTechnique(recipeTechnique(existing))
    setEffort(existing.effort)
    setPortions(existing.portions)
    const stored = readRecipeStorageDays(existing)
    setFridgeDays(stored.fridgeDays)
    setFreezerDays(stored.freezerDays)
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
    const workingSteps = quickMode ? stepsFromQuickText(quickStepsText) : steps
    const normalizedSteps = ensureStepGroups(workingSteps)
    if (!name.trim() || lines.length === 0 || normalizedSteps.every((s) => !s.description.trim())) {
      await appAlert('Name, at least one ingredient, and one step are required.', { title: 'Cannot save' })
      return
    }
    if (normalizedSteps.some((s) => !s.group?.trim())) {
      await appAlert('Every step must belong to a named subrecipe.', { title: 'Cannot save' })
      return
    }
    if (isPrep && (!yieldIngredientId || yieldAmount <= 0)) {
      await appAlert('Prep recipes need a pantry ingredient and yield amount.', { title: 'Cannot save' })
      return
    }
    for (const line of lines) {
      const ing = ingredients.find((i) => i.id === line.ingredientId)
      if (!ing) {
        await appAlert('Every line needs a valid ingredient.', { title: 'Cannot save' })
        return
      }
      const measure = measureUnitOf(line, ing)
      if (!canUseMeasureUnit(ing, measure)) {
        await appAlert(
          `${ing.name}: ${measure} needs a density (set grams per tablespoon on the ingredient) or use ${ing.unit}.`,
          { title: 'Cannot save' },
        )
        return
      }
      if (line.amount <= 0) {
        await appAlert(`${ing.name}: amount must be greater than zero.`, { title: 'Cannot save' })
        return
      }
    }
    let youtube: string | undefined
    if (youtubeUrl.trim()) {
      youtube = normalizeYoutubeUrl(youtubeUrl)
      if (!youtube) {
        await appAlert('YouTube URL looks invalid. Use a youtube.com or youtu.be link.', { title: 'Cannot save' })
        return
      }
    }
    if (recipeStorageOptions({ fridgeDays, freezerDays }).length === 0) {
      await appAlert('Set at least one storage option (fridge or freezer days greater than 0).', { title: 'Cannot save' })
      return
    }
    const now = new Date().toISOString()
    const payload: Omit<Recipe, 'id'> = {
      name: name.trim(),
      description: description.trim(),
      source: source.trim() || undefined,
      youtubeUrl: youtube,
      tips: tips.map((t) => t.trim()).filter(Boolean),
      tip: '',
      recipeKind,
      yieldIngredientId: isPrep ? yieldIngredientId : undefined,
      yieldAmount: isPrep ? yieldAmount : undefined,
      category,
      technique,
      effort,
      portions,
      storageInstructions: storageInstructions.trim() || undefined,
      ...recipeStorageFields(fridgeDays, freezerDays),
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
          imageDataUrl: s.imageDataUrl?.trim() || undefined,
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
      <PageHeader
        title={isNew ? (quickMode ? 'Quick recipe' : 'New recipe') : 'Edit recipe'}
        subtitle={
          quickMode
            ? 'Name, ingredients, and steps — add details later if you need them.'
            : undefined
        }
      />
      <div className="space-y-4">
        {quickMode ? (
          <p className="rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-ink-muted">
            Fridge storage defaults to 3 days. You can change that below or open full details anytime.
          </p>
        ) : null}
        {!quickMode ? (
          <ImageUploadField value={imageDataUrl} onChange={setImageDataUrl} />
        ) : null}
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {!quickMode ? (
          <>
            <Field label="Short description">
              <AutoTextarea
                minRows={2}
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
            <Field
              label="YouTube video (optional)"
              hint="Opens in the browser or YouTube app. Paste a youtube.com or youtu.be link."
            >
              <input
                className={inputClass}
                type="url"
                inputMode="url"
                value={youtubeUrl}
                placeholder="https://youtu.be/… or https://www.youtube.com/watch?v=…"
                onChange={(e) => setYoutubeUrl(e.target.value)}
              />
            </Field>
          </>
        ) : null}
        <Field label="Recipe kind">
          <SelectField
            title="Recipe kind"
            value={recipeKind}
            onChange={(kind) => {
              setRecipeKind(kind)
              if (kind === 'prep') {
                setFridgeDays((d) => (d > 0 && d < 7 ? 14 : d === 0 ? 14 : d))
                if (!yieldIngredientId && ingredients[0]?.id) {
                  setYieldIngredientId(ingredients[0].id)
                }
              }
            }}
            options={[
              { id: 'dish', label: 'Dish — Ready to eat / meals' },
              { id: 'prep', label: 'Prep — adds to pantry (sauces, dashi…)' },
            ]}
          />
        </Field>
        {isPrep ? (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-accent/25 bg-accent/5 p-3 sm:grid-cols-2">
            <Field label="Yields ingredient">
              <SelectField<number>
                title="Yields ingredient"
                value={yieldIngredientId}
                onChange={setYieldIngredientId}
                options={ingredients.map((i) => ({ id: i.id!, label: i.name }))}
              />
            </Field>
            <Field label={`Yield amount (${yieldIng?.unit ?? 'unit'})`}>
              <NumberField value={yieldAmount} min={0} step={1} onChange={setYieldAmount} />
            </Field>
            <p className="col-span-2 text-xs text-ink-muted">
              When you finish cooking, this amount (scaled by batches) is added to the pantry as
              Homemade stock.
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!quickMode ? (
            <>
              <Field label={isPrep ? 'Category' : 'Dish category'}>
                <SelectField
                  title={isPrep ? 'Category' : 'Dish category'}
                  value={category}
                  onChange={setCategory}
                  options={DISH_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
                />
              </Field>
              <Field label="Technique">
                <SelectField
                  title="Technique"
                  value={technique}
                  onChange={setTechnique}
                  options={PREPARATION_TECHNIQUES.map((t) => ({ id: t.id, label: t.label }))}
                />
              </Field>
              <Field label="Effort">
                <SelectField
                  title="Effort"
                  value={effort}
                  onChange={setEffort}
                  options={EFFORT_LEVELS.map((e) => ({ id: e.id, label: e.label }))}
                />
              </Field>
            </>
          ) : null}
          <Field label={isPrep ? 'Batches (scale)' : 'Portions'}>
            <NumberField
              value={portions}
              min={1}
              step={1}
              inputMode="numeric"
              onChange={setPortions}
            />
          </Field>
        </div>

        <section>
          <h2 className="mb-2 text-lg">Ingredients</h2>
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <button
                      type="button"
                      onClick={() => setIngredientPicker(idx)}
                      className={`${inputClass} flex w-full min-w-0 flex-1 flex-col justify-center text-left`}
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
                    <div className="flex shrink-0 items-stretch gap-2">
                      <div className="w-36">
                        <NumberField
                          value={displayAmount}
                          min={0}
                          step={0.1}
                          onChange={(measureAmount) => {
                            if (!ing) return
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
                      </div>
                      <div className="w-24">
                        <SelectField
                          title="Unit"
                          compact
                          value={measure}
                          onChange={async (nextMeasure) => {
                            if (!ing) return
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
                              await appAlert(err instanceof Error ? err.message : 'Cannot convert unit')
                            }
                          }}
                          options={measureOptions.map((u) => ({ id: u, label: u }))}
                        />
                      </div>
                      <RemoveButton
                        icon
                        className="h-auto min-h-10 self-stretch"
                        onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                      />
                    </div>
                  </div>
                  {!quickMode && multiStage ? (
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>Needed</span>
                      <div className="w-40">
                        <SelectField<number>
                          title="When needed"
                          compact
                          value={stageOfLine(line)}
                          onChange={(daysAhead) => {
                            const next = [...lines]
                            next[idx] = {
                              ...line,
                              daysAhead: daysAhead > 0 ? daysAhead : undefined,
                            }
                            setLines(next)
                          }}
                          options={stagesPresent.map((d) => ({
                            id: d,
                            label: stageLabel(d),
                          }))}
                        />
                      </div>
                    </div>
                  ) : null}
                  {ing && measure !== ing.unit && !isSpoonUnit(measure) ? (
                    <p className="text-xs text-ink-muted">
                      Stock: {line.amount} {ing.unit}
                    </p>
                  ) : null}
                </div>
              )
            })}
            <Button
              variant="secondary"
              className="w-full"
              disabled={ingredients.length === 0}
              onClick={() => setIngredientPicker('add')}
            >
              Add ingredient
            </Button>
          </div>
        </section>

        {!quickMode ? (
        <section>
          <h2 className="mb-2 text-lg">Chef’s tips</h2>
          <div className="space-y-2">
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Field label={`Tip ${idx + 1}`}>
                    <AutoTextarea
                      minRows={2}
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
                  <RemoveButton
                    icon
                    className="mt-7"
                    onClick={() => setTips(tips.filter((_, i) => i !== idx))}
                  />
                ) : null}
              </div>
            ))}
            <Button variant="secondary" className="w-full" onClick={() => setTips([...tips, ''])}>
              Add tip
            </Button>
          </div>
        </section>
        ) : null}

        {quickMode ? (
          <section>
            <h2 className="mb-2 text-lg">Steps</h2>
            <Field
              label="One step per line"
              hint="Each line becomes a step. You can add timers and subrecipes in full details."
            >
              <AutoTextarea
                minRows={5}
                value={quickStepsText}
                placeholder={'Wash rice\nCook for 15 minutes\nRest 10 minutes'}
                onChange={(e) => setQuickStepsText(e.target.value)}
              />
            </Field>
          </section>
        ) : (
        <section>
          <h2 className="mb-2 text-lg">Steps</h2>
          <p className="mb-3 text-xs text-ink-muted">
            Every step belongs to a named subrecipe (rice, sauce, garnish…). Set “When” on the
            subrecipe for work that happens on an earlier day — planning the cook then also books a
            prep session for it.
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
              const sectionWhen = stageOfStep(section.steps[0] ?? {})
              return (
              <div
                key={sectionKey}
                className="space-y-3 rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
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
                  <div className="min-w-[10rem] sm:w-44">
                      <Field label="When">
                        <SelectField<number>
                          title="When"
                          value={sectionWhen}
                          onChange={(daysAhead) => {
                            const ids = new Set(section.steps.map((s) => s.id))
                            setSteps(
                              steps.map((s) =>
                                ids.has(s.id)
                                  ? {
                                      ...s,
                                      daysAhead: daysAhead > 0 ? daysAhead : undefined,
                                    }
                                  : s,
                              ),
                            )
                          }}
                          options={stageOptions().map((opt) => ({
                            id: opt.value,
                            label: opt.label,
                          }))}
                        />
                      </Field>
                    </div>
                </div>
                <p className="text-xs text-ink-muted">
                  {section.steps.length} step{section.steps.length === 1 ? '' : 's'}
                </p>
                {section.steps.map((step, localIdx) => {
                  const idx = steps.findIndex((s) => s.id === step.id)
                  return (
                    <div key={step.id} className="rounded-lg border border-line bg-paper-elevated p-3">
                      <Field label={`${displayName} · step ${localIdx + 1}`}>
                        <AutoTextarea
                          minRows={2}
                          value={step.description}
                          onChange={(e) => {
                            const next = [...steps]
                            next[idx] = { ...step, description: e.target.value }
                            setSteps(next)
                          }}
                        />
                      </Field>
                      <ImageUploadField
                        label="Step photo"
                        hint="Optional — tap the photo while cooking to open the gallery."
                        value={step.imageDataUrl}
                        maxWidth={960}
                        onChange={(dataUrl) => {
                          const next = [...steps]
                          next[idx] = { ...step, imageDataUrl: dataUrl }
                          setSteps(next)
                        }}
                      />
                      <Checkbox
                        className="mt-2"
                        checked={step.requiresTimer}
                        onChange={(requiresTimer) => {
                          const next = [...steps]
                          next[idx] = {
                            ...step,
                            requiresTimer,
                            timerDuration: requiresTimer ? step.timerDuration ?? 5 : undefined,
                            timerUnit: requiresTimer ? step.timerUnit ?? 'minutes' : undefined,
                          }
                          setSteps(next)
                        }}
                        label="Requires timer"
                      />
                      {step.requiresTimer ? (
                        <div className="mt-2 flex gap-2">
                          <div className="w-36">
                            <NumberField
                              value={step.timerDuration ?? 0}
                              min={0}
                              step={1}
                              inputMode="numeric"
                              onChange={(timerDuration) => {
                                const next = [...steps]
                                next[idx] = { ...step, timerDuration }
                                setSteps(next)
                              }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <SelectField
                              title="Timer unit"
                              value={step.timerUnit ?? 'minutes'}
                              onChange={(timerUnit) => {
                                const next = [...steps]
                                next[idx] = { ...step, timerUnit }
                                setSteps(next)
                              }}
                              options={[
                                { id: 'seconds', label: 'seconds' },
                                { id: 'minutes', label: 'minutes' },
                                { id: 'hours', label: 'hours' },
                              ]}
                            />
                          </div>
                        </div>
                      ) : null}
                      <RemoveButton
                        className="mt-2 w-full"
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
                      />
                    </div>
                  )
                })}
                <Button
                  variant="secondary"
                  className="w-full"
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
                <RemoveButton
                  className="w-full"
                  label="Remove subrecipe"
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
                />
              </div>
              )
            })}
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                const name = await appPrompt(
                  'Name this part of the recipe (e.g. Rice, Sauce, Garnish).',
                  {
                    title: 'Subrecipe name',
                    placeholder: 'Rice',
                    confirmLabel: 'Add',
                  },
                )
                if (name === null) return
                const group = name.trim()
                if (!group) {
                  await appAlert('Subrecipe name is required.', { title: 'Cannot save' })
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
        </section>
        )}

        <RecipeStorageFields
          fridgeDays={fridgeDays}
          freezerDays={freezerDays}
          storageInstructions={storageInstructions}
          onFridgeDaysChange={setFridgeDays}
          onFreezerDaysChange={setFreezerDays}
          onStorageInstructionsChange={setStorageInstructions}
        />

        <Button className="w-full" onClick={() => void save()}>
          Save recipe
        </Button>
        {quickMode ? (
          <Button className="w-full" variant="secondary" onClick={showAdvanced}>
            More details
          </Button>
        ) : null}
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
