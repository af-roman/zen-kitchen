import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type {
  CookLogEntry,
  CookingSession,
  Goals,
  Ingredient,
  Nutrition,
  PantryItem,
  ReadyBatch,
  Recipe,
  SessionDishPlan,
} from '@/domain/types'
import { expiryFromCook } from '@/domain/kitchen'
import {
  addNutrition,
  emptyNutrition,
  nutritionForAmount,
  scaleNutrition,
  timerToSeconds,
} from '@/domain/nutrition'
import { groupRecipeSteps } from '@/domain/recipeMath'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { CookTimer } from '@/shared/Timer'
import { Badge, Button, Field, PageHeader, WarnBanner, inputClass } from '@/shared/ui'

type UsageRow = { ingredientId: number; pantryItemId: number; amountUsed: number }

export function CookPage() {
  const { id } = useParams()
  const sessionId = Number(id)
  const navigate = useNavigate()
  const goals = useGoals()

  const session = useLiveQuery(() => db.cookingSessions.get(sessionId), [sessionId])
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []

  const [activeIdx, setActiveIdx] = useState(0)
  const [localDishes, setLocalDishes] = useState<SessionDishPlan[] | null>(null)
  const [sessionNotes, setSessionNotes] = useState('')

  useEffect(() => {
    if (!session) return
    setLocalDishes(session.dishes)
    setSessionNotes(session.notes)
  }, [session])

  useEffect(() => {
    if (!session || session.status !== 'active') return
    const t = window.setTimeout(() => {
      void db.cookingSessions.update(sessionId, {
        dishes: localDishes ?? undefined,
        notes: sessionNotes,
        updatedAt: new Date().toISOString(),
      })
    }, 500)
    return () => window.clearTimeout(t)
  }, [localDishes, sessionNotes, sessionId, session])

  useEffect(() => {
    if (!session) return
    if (session.status === 'planned') {
      void db.cookingSessions.update(sessionId, {
        status: 'active',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
  }, [session, sessionId])

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  if (!session || !localDishes) {
    return <p className="text-ink-muted">Loading session…</p>
  }

  return (
    <CookSessionView
      session={session}
      sessionId={sessionId}
      dishes={localDishes}
      setLocalDishes={setLocalDishes}
      sessionNotes={sessionNotes}
      setSessionNotes={setSessionNotes}
      activeIdx={activeIdx}
      setActiveIdx={setActiveIdx}
      recipeById={recipeById}
      ingById={ingById}
      pantry={pantry}
      goals={goals}
      navigate={navigate}
    />
  )
}

function usageForIngredient(dish: SessionDishPlan, ingredientId: number): UsageRow[] {
  return (dish.usage ?? []).filter((u) => u.ingredientId === ingredientId)
}

function mergeUsage(dish: SessionDishPlan, ingredientId: number, rows: UsageRow[]): UsageRow[] {
  const others = (dish.usage ?? []).filter((u) => u.ingredientId !== ingredientId)
  return [...others, ...rows]
}

function defaultUsageRow(
  ingredientId: number,
  amount: number,
  pantry: PantryItem[],
): UsageRow {
  const candidates = pantry.filter((p) => p.ingredientId === ingredientId)
  return {
    ingredientId,
    pantryItemId: candidates[0]?.id ?? 0,
    amountUsed: amount,
  }
}

function capAmount(pantryItemId: number, amountUsed: number, pantry: PantryItem[]): number {
  const item = pantry.find((p) => p.id === pantryItemId)
  const max = item?.amountLeft ?? 0
  return Math.min(Math.max(0, amountUsed), max)
}

function CookSessionView({
  session,
  sessionId,
  dishes,
  setLocalDishes,
  sessionNotes,
  setSessionNotes,
  activeIdx,
  setActiveIdx,
  recipeById,
  ingById,
  pantry,
  goals,
  navigate,
}: {
  session: CookingSession
  sessionId: number
  dishes: SessionDishPlan[]
  setLocalDishes: React.Dispatch<React.SetStateAction<SessionDishPlan[] | null>>
  sessionNotes: string
  setSessionNotes: (v: string) => void
  activeIdx: number
  setActiveIdx: (v: number) => void
  recipeById: Map<number, Recipe>
  ingById: Map<number, Ingredient>
  pantry: PantryItem[]
  goals: Goals
  navigate: ReturnType<typeof useNavigate>
}) {
  const finishPrompted = useRef(false)
  const dish = dishes[activeIdx]
  const recipe = dish ? recipeById.get(dish.recipeId) : undefined

  useEffect(() => {
    finishPrompted.current = false
  }, [sessionId])

  useEffect(() => {
    if (dishes.length === 0) return
    if (!dishes.every((d) => d.completed)) return
    if (finishPrompted.current) return
    finishPrompted.current = true
    if (confirm('All dishes in this session are cooked. Finish the cooking session now?')) {
      void finishSession(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes.map((d) => d.completed).join(',')])

  function updateDish(idx: number, patch: Partial<SessionDishPlan>) {
    setLocalDishes((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  function liveNutrition(d: SessionDishPlan): Nutrition {
    if (!d.usage?.length) return emptyNutrition()
    let total = emptyNutrition()
    for (const u of d.usage) {
      if (!u.pantryItemId || u.amountUsed <= 0) continue
      const item = pantry.find((p) => p.id === u.pantryItemId)
      const ing = ingById.get(u.ingredientId)
      if (!ing) continue
      const per100 = item?.nutritionOverride ?? ing.nutritionPer100
      total = addNutrition(
        total,
        nutritionForAmount(per100, u.amountUsed, ing.unit, ing.avgPieceGrams),
      )
    }
    return scaleNutrition(total, 1 / Math.max(1, d.portions))
  }

  function ensureUsageInitialized(idx: number) {
    const d = dishes[idx]
    const r = recipeById.get(d.recipeId)
    if (!r || d.usage?.length) return
    const scale = d.portions / r.portions
    const usage = r.ingredients.map((line) =>
      defaultUsageRow(
        line.ingredientId,
        Math.round(line.amount * scale * 10) / 10,
        pantry,
      ),
    )
    updateDish(idx, { usage })
  }

  useEffect(() => {
    ensureUsageInitialized(activeIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, dish?.portions, recipe?.id])

  async function finishDish(idx: number) {
    const d = dishes[idx]
    const r = recipeById.get(d.recipeId)
    if (!r) return

    const stepsDone = d.stepsDone?.length ?? 0
    if (stepsDone < r.steps.length) {
      if (
        !confirm(
          `Only ${stepsDone} of ${r.steps.length} cooking steps are checked off. Mark dish cooked anyway?`,
        )
      ) {
        return
      }
    }

    for (const line of r.ingredients) {
      const rows = usageForIngredient(d, line.ingredientId).filter((u) => u.pantryItemId > 0)
      if (rows.length === 0) {
        if (!confirm(`No pantry item selected for ${ingById.get(line.ingredientId)?.name ?? 'an ingredient'}. Finish anyway?`)) {
          return
        }
        break
      }
      for (const row of rows) {
        const item = pantry.find((p) => p.id === row.pantryItemId)
        if (row.amountUsed > (item?.amountLeft ?? 0)) {
          alert(`Amount for ${ingById.get(line.ingredientId)?.name ?? 'ingredient'} exceeds available stock.`)
          return
        }
      }
    }

    for (const u of d.usage ?? []) {
      if (!u.pantryItemId || u.amountUsed <= 0) continue
      const item = await db.pantryItems.get(u.pantryItemId)
      if (!item) continue
      await db.pantryItems.update(u.pantryItemId, {
        amountLeft: Math.max(0, item.amountLeft - u.amountUsed),
        updatedAt: new Date().toISOString(),
      })
    }
    updateDish(idx, { completed: true, nutritionPerPortion: liveNutrition(d) })
  }

  async function finishSession(skipConfirm = false) {
    if (
      !skipConfirm &&
      !confirm(
        'Finish this cooking session? Portions, stock changes, and nutrition (except notes) will be locked.',
      )
    ) {
      return
    }
    const now = new Date().toISOString()
    const cookedAt = now.slice(0, 10)

    for (const d of dishes) {
      if (!d.completed) continue
      const r = recipeById.get(d.recipeId)
      if (!r) continue
      const nutrition = d.nutritionPerPortion ?? liveNutrition(d)
      const planned = d.portionsPlanned ?? 0
      const batch: Omit<ReadyBatch, 'id'> = {
        recipeId: d.recipeId,
        sessionId,
        cookedAt,
        expiresAt: expiryFromCook(cookedAt, r.storageDays),
        portionsLeft: Math.max(0, d.portions - planned),
        portionsPlanned: planned,
        nutritionPerPortion: nutrition,
        notes: d.notes ?? '',
      }
      const batchId = await db.readyBatches.add(batch)

      const allServings = await db.servings.toArray()
      for (const serving of allServings) {
        let changed = false
        const items = serving.items.map((item) => {
          if (
            item.plannedSessionId === sessionId &&
            item.recipeId === d.recipeId &&
            !item.batchId
          ) {
            changed = true
            return { ...item, batchId, nutrition: nutrition }
          }
          return item
        })
        if (changed) await db.servings.update(serving.id!, { items })
      }
      void batchId
    }

    const log: Omit<CookLogEntry, 'id'> = {
      sessionId,
      date: session.date,
      dishes: dishes
        .filter((d) => d.completed)
        .map((d) => {
          const r = recipeById.get(d.recipeId)
          return {
            recipeId: d.recipeId,
            recipeName: r?.name ?? 'Dish',
            portions: d.portions,
            nutritionPerPortion: d.nutritionPerPortion ?? liveNutrition(d),
            usage: (d.usage ?? []).map((u) => {
              const ing = ingById.get(u.ingredientId)
              return {
                ingredientId: u.ingredientId,
                ingredientName: ing?.name ?? '?',
                amountUsed: u.amountUsed,
                unit: ing?.unit ?? 'g',
              }
            }),
          }
        }),
      notes: sessionNotes,
      createdAt: now,
    }
    await db.cookLog.add(log)
    await db.cookingSessions.update(sessionId, {
      status: 'done',
      finishedAt: now,
      dishes,
      notes: sessionNotes,
      updatedAt: now,
    })
    navigate('/ready')
  }

  if (!recipe || !dish) {
    return <p className="text-ink-muted">No dishes in this session.</p>
  }

  const scale = dish.portions / recipe.portions

  function updateIngredientUsage(ingredientId: number, rows: UsageRow[]) {
    updateDish(activeIdx, { usage: mergeUsage(dish, ingredientId, rows) })
  }

  return (
    <div>
      <PageHeader
        title="Cook"
        subtitle={`Session ${session.date}`}
        actions={
          <Button variant="secondary" onClick={() => navigate('/')}>
            Leave
          </Button>
        }
      />
      <WarnBanner>
        One session can stay active while you browse — return anytime from the banner.
      </WarnBanner>

      <div className="my-4 flex gap-2 overflow-x-auto pb-1">
        {dishes.map((d, idx) => {
          const r = recipeById.get(d.recipeId)
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm ${
                idx === activeIdx
                  ? 'border-accent-deep bg-accent/15 text-accent-deep'
                  : 'border-line bg-paper-elevated'
              }`}
            >
              {r?.name ?? 'Dish'}
              {d.completed ? ' ✓' : ''}
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex items-end gap-3">
        <Field label="Portions for this cook">
          <input
            className={inputClass}
            type="number"
            min={1}
            value={dish.portions}
            disabled={dish.completed}
            onChange={(e) => {
              const portions = Number(e.target.value)
              const usage = recipe.ingredients.map((line) => {
                const existing = usageForIngredient(dish, line.ingredientId)
                if (existing.length > 0) {
                  return {
                    ...existing[0],
                    amountUsed: Math.round(line.amount * (portions / recipe.portions) * 10) / 10,
                  }
                }
                return defaultUsageRow(
                  line.ingredientId,
                  Math.round(line.amount * (portions / recipe.portions) * 10) / 10,
                  pantry,
                )
              })
              updateDish(activeIdx, { portions, usage })
            }}
          />
        </Field>
        <Badge>{recipe.effort}</Badge>
      </div>

      <section className="mb-5">
        <h2 className="mb-2 text-lg">Pantry & amounts</h2>
        <ul className="space-y-3">
          {recipe.ingredients.map((line) => {
            const ing = ingById.get(line.ingredientId)
            const candidates = pantry.filter((p) => p.ingredientId === line.ingredientId)
            const rows =
              usageForIngredient(dish, line.ingredientId).length > 0
                ? usageForIngredient(dish, line.ingredientId)
                : [defaultUsageRow(line.ingredientId, Math.round(line.amount * scale * 10) / 10, pantry)]
            const needed = Math.round(line.amount * scale * 10) / 10

            return (
              <li key={line.ingredientId} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex justify-between gap-2">
                  <span className="font-medium">{ing?.name}</span>
                  <span className="text-xs text-ink-muted">
                    Need {needed} {ing?.unit}
                  </span>
                </div>
                {rows.map((row, rowIdx) => (
                  <div key={rowIdx} className={`space-y-2 ${rowIdx > 0 ? 'mt-3 border-t border-line pt-3' : ''}`}>
                    <Field label="Pantry item">
                      <select
                        className={inputClass}
                        disabled={dish.completed}
                        value={row.pantryItemId}
                        onChange={(e) => {
                          const pantryItemId = Number(e.target.value)
                          const next = [...rows]
                          next[rowIdx] = {
                            ...row,
                            pantryItemId,
                            amountUsed: capAmount(pantryItemId, row.amountUsed, pantry),
                          }
                          updateIngredientUsage(line.ingredientId, next)
                        }}
                      >
                        {candidates.length === 0 ? (
                          <option value={0}>No stock — add to pantry</option>
                        ) : (
                          candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.brand || 'Unbranded'} · {c.amountLeft} {ing?.unit} left
                            </option>
                          ))
                        )}
                      </select>
                    </Field>
                    <Field label={`Amount used (${ing?.unit})`}>
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        max={pantry.find((p) => p.id === row.pantryItemId)?.amountLeft ?? 0}
                        disabled={dish.completed}
                        value={row.amountUsed}
                        onChange={(e) => {
                          const pantryItemId = row.pantryItemId
                          const amountUsed = capAmount(pantryItemId, Number(e.target.value), pantry)
                          const next = [...rows]
                          next[rowIdx] = { ...row, amountUsed }
                          updateIngredientUsage(line.ingredientId, next)
                        }}
                      />
                    </Field>
                  </div>
                ))}
                {!dish.completed && candidates.length > 1 ? (
                  <Button
                    variant="ghost"
                    className="mt-2 !py-1 !text-xs"
                    onClick={() => {
                      const usedIds = new Set(rows.map((r) => r.pantryItemId))
                      const nextItem = candidates.find((c) => !usedIds.has(c.id!))
                      if (!nextItem) return
                      updateIngredientUsage(line.ingredientId, [
                        ...rows,
                        {
                          ingredientId: line.ingredientId,
                          pantryItemId: nextItem.id!,
                          amountUsed: 0,
                        },
                      ])
                    }}
                  >
                    + Add another pantry item
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-3 text-lg">Live nutrition / portion</h2>
        <MacroBar nutrition={liveNutrition(dish)} goals={goals} />
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-lg">Steps</h2>
        <div className="space-y-4">
          {groupRecipeSteps(recipe.steps).map((section) => {
            const sectionDone = section.steps.filter((s) =>
              dish.stepsDone?.includes(s.id),
            ).length
            return (
              <div
                key={`${section.name ?? 'steps'}-${section.steps[0]?.id}`}
                className={
                  section.name
                    ? 'rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 p-3'
                    : undefined
                }
              >
                {section.name ? (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-display text-base text-accent-deep">{section.name}</h3>
                    <span className="text-xs text-ink-muted">
                      {sectionDone}/{section.steps.length}
                    </span>
                  </div>
                ) : null}
                <ul className="space-y-3">
                  {section.steps.map((step) => {
                    const done = dish.stepsDone?.includes(step.id)
                    return (
                      <li key={step.id} className="rounded-lg border border-line bg-paper-elevated p-3">
                        <label className="flex gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(done)}
                            disabled={dish.completed}
                            onChange={(e) => {
                              const set = new Set(dish.stepsDone ?? [])
                              if (e.target.checked) set.add(step.id)
                              else set.delete(step.id)
                              updateDish(activeIdx, { stepsDone: [...set] })
                            }}
                          />
                          <span className={done ? 'text-ink-muted line-through' : ''}>
                            {step.description}
                          </span>
                        </label>
                        {step.requiresTimer && step.timerDuration && step.timerUnit ? (
                          <CookTimer
                            presetSeconds={timerToSeconds(step.timerDuration, step.timerUnit)}
                            label={section.name ? `${section.name} timer` : 'Step timer'}
                          />
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Progress: {dish.stepsDone?.length ?? 0}/{recipe.steps.length} steps
        </p>
      </section>

      <Field label="Notes for this dish">
        <textarea
          className={inputClass}
          rows={2}
          value={dish.notes ?? ''}
          onChange={(e) => updateDish(activeIdx, { notes: e.target.value })}
        />
      </Field>

      {!dish.completed ? (
        <Button className="mt-4 w-full" onClick={() => void finishDish(activeIdx)}>
          Mark dish cooked
        </Button>
      ) : (
        <p className="mt-4 text-center text-sm text-ok">Dish marked cooked for this session.</p>
      )}

      <Field label="Session notes">
        <textarea
          className={`${inputClass} mt-4`}
          rows={2}
          value={sessionNotes}
          onChange={(e) => setSessionNotes(e.target.value)}
        />
      </Field>

      <Button className="mt-4 w-full" variant="primary" onClick={() => void finishSession()}>
        Finish cooking session
      </Button>
      <p className="mt-2 text-center text-xs text-ink-muted">
        You can finish without completing every dish.
      </p>
    </div>
  )
}
