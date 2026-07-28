import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { cancelActiveCookingSession } from '@/db/servingOps'
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
import { expiryFromCook, formatQuantity, isPrepRecipe, prepYieldAmount } from '@/domain/kitchen'
import { formatRecipeAmount, measureUnitOf } from '@/domain/measures'
import { Sheet } from '@/shared/Sheet'
import {
  addNutrition,
  emptyNutrition,
  nutritionForAmount,
  scaleNutrition,
  timerToSeconds,
} from '@/domain/nutrition'
import { groupRecipeSteps, recipeNutrition } from '@/domain/recipeMath'
import {
  dishStage,
  isPrepLeg,
  isStagedRecipe,
  stageIngredients,
  stageLabel,
  stageSteps,
} from '@/domain/stages'
import { unfinishedPrepLegs } from '@/db/sessionChains'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { CookTimer } from '@/shared/Timer'
import { ChefTipsPanel } from '@/shared/ChefTips'
import { RecipeStoragePanel } from '@/shared/RecipeStoragePanel'
import { Badge, Button, Field, PageHeader, WarnBanner, inputClass } from '@/shared/ui'

type UsageRow = { ingredientId: number; pantryItemId: number; amountUsed: number }

export function CookPage() {
  const { id } = useParams()
  const sessionId = Number(id)
  const navigate = useNavigate()
  const goals = useGoals()

  const session = useLiveQuery(() => db.cookingSessions.get(sessionId), [sessionId])
  const allSessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []

  const [activeIdx, setActiveIdx] = useState(0)
  const [localDishes, setLocalDishes] = useState<SessionDishPlan[] | null>(null)
  const [sessionNotes, setSessionNotes] = useState('')
  /** Only auto-start a planned session once per page visit — not after Cancel. */
  const didAutoStart = useRef(false)

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
    if (session.status === 'active') {
      didAutoStart.current = true
      return
    }
    if (session.status !== 'planned' || didAutoStart.current) return
    didAutoStart.current = true
    void db.cookingSessions.update(sessionId, {
      status: 'active',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
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
      allSessions={allSessions}
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
  allSessions,
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
  allSessions: CookingSession[]
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
  const [finishNext, setFinishNext] = useState<{
    addedReadyBatch: boolean
    addedPrep: boolean
  } | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
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
    if (confirm('All recipes in this session are cooked. Finish the cooking session now?')) {
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

  /** Per-portion nutrition: a leg only touches part of the recipe, so use the recipe instead. */
  function dishNutrition(d: SessionDishPlan): Nutrition {
    if (isPrepLeg(d)) return emptyNutrition()
    const r = recipeById.get(d.recipeId)
    if (r && isStagedRecipe(r)) return recipeNutrition(r, ingById)
    return liveNutrition(d)
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
    const usage = stageIngredients(r, dishStage(d)).map((line) =>
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

    const stage = dishStage(d)
    const lines = stageIngredients(r, stage)
    const steps = stageSteps(r, stage)
    const stepsDone = steps.filter((s) => d.stepsDone?.includes(s.id)).length
    if (stepsDone < steps.length) {
      if (
        !confirm(
          `Only ${stepsDone} of ${steps.length} cooking steps are checked off. Mark ${
            isPrepLeg(d) ? 'stage done' : 'dish cooked'
          } anyway?`,
        )
      ) {
        return
      }
    }

    for (const line of lines) {
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
    updateDish(idx, { completed: true, nutritionPerPortion: dishNutrition(d) })
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
    let addedReadyBatch = false
    let addedPrep = false
    const prepYieldNotes: string[] = []

    for (const d of dishes) {
      if (!d.completed) continue
      const r = recipeById.get(d.recipeId)
      if (!r) continue
      // Prep legs only record usage and a log line — food appears on the final cook day.
      if (isPrepLeg(d)) continue

      if (isPrepRecipe(r)) {
        if (!r.yieldIngredientId || r.yieldAmount == null) continue
        const yieldAmt = prepYieldAmount(r, d.portions)
        if (yieldAmt <= 0) continue
        const yieldIng = ingById.get(r.yieldIngredientId)
        const pantryItem: Omit<PantryItem, 'id'> = {
          ingredientId: r.yieldIngredientId,
          brand: 'Homemade',
          amountLeft: yieldAmt,
          expiryDate: expiryFromCook(cookedAt, r.storageDays),
          createdAt: now,
          updatedAt: now,
        }
        await db.pantryItems.add(pantryItem)
        addedPrep = true
        prepYieldNotes.push(
          `${r.name}: +${yieldAmt} ${yieldIng?.unit ?? ''} ${yieldIng?.name ?? 'pantry'}`.trim(),
        )
        continue
      }

      const nutrition = d.nutritionPerPortion ?? dishNutrition(d)
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
      addedReadyBatch = true

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

    const logNotes = [sessionNotes, ...prepYieldNotes.map((n) => `Prep → pantry: ${n}`)]
      .filter(Boolean)
      .join('\n')

    const log: Omit<CookLogEntry, 'id'> = {
      sessionId,
      date: session.date,
      dishes: dishes
        .filter((d) => d.completed)
        .map((d) => {
          const r = recipeById.get(d.recipeId)
          return {
            recipeId: d.recipeId,
            recipeName: isPrepLeg(d)
              ? `${r?.name ?? 'Dish'} — ${stageLabel(dishStage(d)).toLowerCase()}`
              : (r?.name ?? 'Dish'),
            portions: d.portions,
            nutritionPerPortion: isPrepLeg(d)
              ? emptyNutrition()
              : (d.nutritionPerPortion ?? dishNutrition(d)),
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
      notes: logNotes,
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
    setFinishNext({ addedReadyBatch, addedPrep })
  }

  async function cancelSession() {
    await cancelActiveCookingSession(sessionId)
    setCancelOpen(false)
    navigate('/')
  }

  if (finishNext) {
    return (
      <div>
        <PageHeader title="Session finished" subtitle={`Cooked on ${session.date}`} />
        <Sheet open title="What’s next?" onClose={() => navigate('/')}>
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {finishNext.addedReadyBatch
                ? 'Dish portions are in Ready to eat. Assign them to meals when you like.'
                : null}
              {finishNext.addedPrep
                ? `${finishNext.addedReadyBatch ? ' ' : ''}Prep yields were added to the pantry as Homemade.`
                : null}
              {!finishNext.addedReadyBatch && !finishNext.addedPrep
                ? dishes.some((d) => d.completed && isPrepLeg(d))
                  ? 'Early stage recorded. The food itself arrives when you cook the final stage.'
                  : 'Session closed. No completed recipes to store.'
                : null}
            </p>
            {finishNext.addedReadyBatch ? (
              <>
                <Button className="w-full" onClick={() => navigate('/serve')}>
                  Serve this week
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => navigate('/ready')}
                >
                  View Ready to eat
                </Button>
              </>
            ) : null}
            {finishNext.addedPrep && !finishNext.addedReadyBatch ? (
              <Button className="w-full" onClick={() => navigate('/pantry')}>
                View pantry
              </Button>
            ) : null}
            <Button className="w-full" variant="ghost" onClick={() => navigate('/')}>
              Back to week
            </Button>
          </div>
        </Sheet>
      </div>
    )
  }

  if (!recipe || !dish) {
    return <p className="text-ink-muted">No recipes in this session.</p>
  }

  const scale = dish.portions / recipe.portions
  const stage = dishStage(dish)
  const stageLines = stageIngredients(recipe, stage)
  const stageStepList = stageSteps(recipe, stage)
  const legOfChain = isPrepLeg(dish)
  const missingPrep = legOfChain ? [] : unfinishedPrepLegs(allSessions, dish)

  function updateIngredientUsage(ingredientId: number, rows: UsageRow[]) {
    updateDish(activeIdx, { usage: mergeUsage(dish, ingredientId, rows) })
  }

  return (
    <div>
      <PageHeader
        title={legOfChain ? `Prep · ${stageLabel(stage)}` : 'Cook'}
        subtitle={
          legOfChain
            ? `${recipe.name} — ${session.date}, ${stageLabel(stage).toLowerCase()} the cook`
            : `Session ${session.date}`
        }
        actions={
          <Button variant="secondary" onClick={() => navigate('/')}>
            Leave
          </Button>
        }
      />
      <WarnBanner>
        One session can stay active while you browse — return anytime from the banner.
      </WarnBanner>
      {legOfChain ? (
        <p className="mt-2 rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-ink-muted">
          This is an early stage only — nothing lands in Ready to eat today. The rest happens on the
          cook day.
        </p>
      ) : null}
      {missingPrep.length > 0 ? (
        <div className="mt-2">
          <WarnBanner>
            {recipe.name}: the {stageLabel(dishStage(missingPrep[0].dish)).toLowerCase()} stage on{' '}
            {missingPrep[0].session.date} is not marked done yet.
          </WarnBanner>
        </div>
      ) : null}

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
              {isPrepLeg(d) ? ` · ${stageLabel(dishStage(d)).toLowerCase()}` : ''}
              {d.completed ? ' ✓' : ''}
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex items-end gap-3">
        <Field label={isPrepRecipe(recipe) ? 'Batches for this cook' : 'Portions for this cook'}>
          <input
            className={inputClass}
            type="number"
            min={1}
            value={dish.portions}
            disabled={dish.completed}
            onChange={(e) => {
              const portions = Number(e.target.value)
              const usage = stageLines.map((line) => {
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
        {legOfChain ? <Badge tone="accent">{stageLabel(stage)}</Badge> : null}
        {isPrepRecipe(recipe) && !legOfChain ? <Badge tone="accent">Adds to pantry</Badge> : null}
      </div>
      {isPrepRecipe(recipe) && !legOfChain && recipe.yieldIngredientId && recipe.yieldAmount != null ? (
        <p className="mb-4 text-sm text-ink-muted">
          Finish will add{' '}
          <span className="font-medium text-ink">
            {prepYieldAmount(recipe, dish.portions)}{' '}
            {ingById.get(recipe.yieldIngredientId)?.unit}
          </span>{' '}
          Homemade {ingById.get(recipe.yieldIngredientId)?.name} to the pantry.
        </p>
      ) : null}

      <section className="mb-5">
        <h2 className="mb-2 text-lg">
          Pantry & amounts
          {legOfChain ? (
            <span className="ml-2 text-sm text-ink-muted">
              ({stageLabel(stage).toLowerCase()} only)
            </span>
          ) : null}
        </h2>
        {stageLines.length === 0 ? (
          <p className="text-sm text-ink-muted">This stage needs nothing from the pantry.</p>
        ) : null}
        <ul className="space-y-3">
          {stageLines.map((line, lineIdx) => {
            const ing = ingById.get(line.ingredientId)
            const candidates = pantry.filter((p) => p.ingredientId === line.ingredientId)
            const rows =
              usageForIngredient(dish, line.ingredientId).length > 0
                ? usageForIngredient(dish, line.ingredientId)
                : [defaultUsageRow(line.ingredientId, Math.round(line.amount * scale * 10) / 10, pantry)]
            const needed = Math.round(line.amount * scale * 10) / 10
            const needLabel = ing
              ? formatRecipeAmount(needed, measureUnitOf(line, ing), ing)
              : { primary: String(needed) }

            return (
              <li key={`${line.ingredientId}-${lineIdx}`} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex justify-between gap-2">
                  <span className="font-medium">{ing?.name}</span>
                  <span className="text-right text-xs text-ink-muted">
                    Need {needLabel.primary}
                    {needLabel.stockHint ? (
                      <span className="block">({needLabel.stockHint})</span>
                    ) : null}
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
        <MacroBar
          nutrition={isStagedRecipe(recipe) ? recipeNutrition(recipe, ingById) : liveNutrition(dish)}
          goals={goals}
          goalCaption={
            isStagedRecipe(recipe)
              ? 'Whole recipe per portion, across all stages'
              : 'Compared to your daily targets (per portion)'
          }
        />
      </section>

      <ChefTipsPanel recipe={recipe} />

      <RecipeStoragePanel
        storageDays={recipe.storageDays}
        storageEnv={recipe.storageEnv}
        storageInstructions={recipe.storageInstructions}
      />

      <section className="mb-5">
        <h2 className="mb-2 text-lg">
          Steps
          {legOfChain ? (
            <span className="ml-2 text-sm text-ink-muted">({stageLabel(stage).toLowerCase()})</span>
          ) : null}
        </h2>
        <div className="space-y-4">
          {groupRecipeSteps(stageStepList).map((section) => {
            const sectionDone = section.steps.filter((s) =>
              dish.stepsDone?.includes(s.id),
            ).length
            return (
              <div
                key={`${section.name}-${section.steps[0]?.id}`}
                className="rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-display text-base text-accent-deep">{section.name}</h3>
                  <span className="text-xs text-ink-muted">
                    {sectionDone}/{section.steps.length}
                  </span>
                </div>
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
                            label={`${section.name} timer`}
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
          Progress: {stageStepList.filter((s) => dish.stepsDone?.includes(s.id)).length}/
          {stageStepList.length} steps
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
          {legOfChain
            ? 'Mark stage done'
            : isPrepRecipe(recipe)
              ? 'Mark prep cooked'
              : 'Mark dish cooked'}
        </Button>
      ) : (
        <p className="mt-4 text-center text-sm text-ok">
          {legOfChain
            ? `${stageLabel(stage)} stage done — continue on the cook day.`
            : `${isPrepRecipe(recipe) ? 'Prep' : 'Dish'} marked cooked for this session.`}
        </p>
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
        You can finish without completing every recipe. Active: {formatQuantity(recipe, dish.portions)}.
      </p>

      <Button
        className="mt-6 w-full"
        variant="danger"
        onClick={() => setCancelOpen(true)}
      >
        Cancel session
      </Button>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Discards all progress. Pantry is unchanged and nothing is added to Ready to eat.
      </p>

      <Sheet open={cancelOpen} title="Cancel cooking session?" onClose={() => setCancelOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Step checkoffs, pantry picks, and dish notes for this session will be lost. Any
            ingredients already marked cooked will be returned to the pantry. Nothing is added to
            Ready to eat or the cook log.
          </p>
          <Button className="w-full" variant="danger" onClick={() => void cancelSession()}>
            Cancel session
          </Button>
          <Button className="w-full" variant="ghost" onClick={() => setCancelOpen(false)}>
            Keep cooking
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
