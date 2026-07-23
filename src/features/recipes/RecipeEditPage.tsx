import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  DISH_CATEGORIES,
  EFFORT_LEVELS,
  type DishCategory,
  type Effort,
  type Recipe,
  type RecipeIngredientLine,
  type RecipeStep,
  type StorageEnv,
  type TimeUnit,
} from '@/domain/types'
import { uid } from '@/domain/kitchen'
import { fileToDataUrl, groupRecipeSteps } from '@/domain/recipeMath'
import { Badge, Button, Field, PageHeader, inputClass } from '@/shared/ui'

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
  const [tip, setTip] = useState('')
  const [category, setCategory] = useState<DishCategory>('other')
  const [effort, setEffort] = useState<Effort>('easy')
  const [portions, setPortions] = useState(4)
  const [storageDays, setStorageDays] = useState(3)
  const [storageEnv, setStorageEnv] = useState<StorageEnv>('fridge')
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>()
  const [lines, setLines] = useState<RecipeIngredientLine[]>([])
  const [steps, setSteps] = useState<RecipeStep[]>([
    { id: uid(), description: '', requiresTimer: false },
  ])

  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setDescription(existing.description)
    setTip(existing.tip)
    setCategory(existing.category)
    setEffort(existing.effort)
    setPortions(existing.portions)
    setStorageDays(existing.storageDays)
    setStorageEnv(existing.storageEnv)
    setImageDataUrl(existing.imageDataUrl)
    setLines(existing.ingredients)
    setSteps(existing.steps)
  }, [existing])

  async function save() {
    if (!name.trim() || lines.length === 0 || steps.every((s) => !s.description.trim())) {
      alert('Name, at least one ingredient, and one step are required.')
      return
    }
    const now = new Date().toISOString()
    const payload: Omit<Recipe, 'id'> = {
      name: name.trim(),
      description: description.trim(),
      tip: tip.trim(),
      category,
      effort,
      portions,
      storageDays,
      storageEnv,
      imageDataUrl,
      ingredients: lines,
      steps: steps
        .filter((s) => s.description.trim())
        .map((s) => ({
          ...s,
          group: s.group?.trim() || undefined,
        })),
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
        <Field label="Photo">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void fileToDataUrl(f).then(setImageDataUrl)
            }}
          />
        </Field>
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
        <Field label="Chef’s tip">
          <textarea
            className={inputClass}
            rows={2}
            value={tip}
            onChange={(e) => setTip(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dish category">
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
          <Field label="Portions">
            <input
              className={inputClass}
              type="number"
              min={1}
              value={portions}
              onChange={(e) => setPortions(Number(e.target.value))}
            />
          </Field>
          <Field label="Keeps (days)">
            <input
              className={inputClass}
              type="number"
              min={1}
              value={storageDays}
              onChange={(e) => setStorageDays(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Storage">
          <select
            className={inputClass}
            value={storageEnv}
            onChange={(e) => setStorageEnv(e.target.value as StorageEnv)}
          >
            <option value="fridge">Fridge</option>
            <option value="freezer">Freezer</option>
            <option value="room">Room temperature</option>
          </select>
        </Field>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg">Ingredients</h2>
            <Button
              variant="secondary"
              onClick={() =>
                setLines([
                  ...lines,
                  { ingredientId: ingredients[0]?.id ?? 0, amount: 0 },
                ])
              }
            >
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="flex gap-2">
                <select
                  className={inputClass}
                  value={line.ingredientId}
                  onChange={(e) => {
                    const next = [...lines]
                    next[idx] = { ...line, ingredientId: Number(e.target.value) }
                    setLines(next)
                  }}
                >
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
                <input
                  className={`${inputClass} w-24`}
                  type="number"
                  value={line.amount}
                  onChange={(e) => {
                    const next = [...lines]
                    next[idx] = { ...line, amount: Number(e.target.value) }
                    setLines(next)
                  }}
                />
                <Button
                  variant="ghost"
                  onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Steps</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const lastGroup = steps[steps.length - 1]?.group?.trim() || undefined
                  setSteps([
                    ...steps,
                    { id: uid(), description: '', requiresTimer: false, group: lastGroup },
                  ])
                }}
              >
                Add step
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const name = prompt('Subrecipe name (e.g. Rice, Sauce, Garnish)')
                  if (name === null) return
                  const group = name.trim() || undefined
                  setSteps([
                    ...steps,
                    { id: uid(), description: '', requiresTimer: false, group },
                  ])
                }}
              >
                Add subrecipe
              </Button>
            </div>
          </div>
          <p className="mb-3 text-xs text-ink-muted">
            Optional: group steps into named subrecipes (rice, sauce, garnish…). Consecutive steps
            with the same name form one section.
          </p>
          <datalist id="recipe-subrecipe-names">
            {[
              ...new Set(
                steps.map((s) => s.group?.trim()).filter((g): g is string => Boolean(g)),
              ),
            ].map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <div className="space-y-4">
            {groupRecipeSteps(steps).map((section) => (
              <div
                key={`${section.name ?? 'ungrouped'}-${section.steps[0]?.id}`}
                className={`space-y-3 ${
                  section.name
                    ? 'rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 p-3'
                    : ''
                }`}
              >
                {section.name ? (
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">{section.name}</Badge>
                    <span className="text-xs text-ink-muted">
                      {section.steps.length} step{section.steps.length === 1 ? '' : 's'}
                    </span>
                  </div>
                ) : null}
                {section.steps.map((step, localIdx) => {
                  const idx = steps.findIndex((s) => s.id === step.id)
                  return (
                    <div key={step.id} className="rounded-lg border border-line bg-paper-elevated p-3">
                      <Field label="Subrecipe">
                        <input
                          className={inputClass}
                          list="recipe-subrecipe-names"
                          value={step.group ?? ''}
                          placeholder="Optional — e.g. Sauce"
                          onChange={(e) => {
                            const next = [...steps]
                            next[idx] = {
                              ...step,
                              group: e.target.value || undefined,
                            }
                            setSteps(next)
                          }}
                        />
                      </Field>
                      <Field
                        label={
                          section.name
                            ? `${section.name} · step ${localIdx + 1}`
                            : `Step ${idx + 1}`
                        }
                      >
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
                        onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                      >
                        Remove step
                      </Button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </section>

        <Button className="w-full" onClick={() => void save()}>
          Save recipe
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
