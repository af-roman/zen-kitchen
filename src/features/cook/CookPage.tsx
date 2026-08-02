import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { cancelActiveCookingSession } from '@/db/servingOps'
import type {
  BatchStorage,
  CookLogEntry,
  CookingSession,
  Goals,
  Ingredient,
  MeasureUnit,
  Nutrition,
  PantryItem,
  ReadyBatch,
  Recipe,
  SessionDishPlan,
} from '@/domain/types'
import { INGREDIENT_CATEGORIES } from '@/domain/types'
import { expiryFromCook, formatQuantity, isAlwaysAvailable, isPrepRecipe, prepYieldAmount, storageLabel } from '@/domain/kitchen'
import {
  defaultStoragePlace,
  recipeStorageOptions,
  storageDaysFor,
  type StorageOption,
} from '@/domain/storage'
import {
  allowedMeasureUnits,
  formatRecipeAmount,
  fromStockAmount,
  measureUnitOf,
  toStockAmount,
} from '@/domain/measures'
import { Sheet } from '@/shared/Sheet'
import { SearchPickerSheet } from '@/shared/SearchPickerSheet'
import {
  addNutrition,
  emptyNutrition,
  nutritionForAmount,
  scaleNutrition,
  timerToSeconds,
} from '@/domain/nutrition'
import { groupRecipeSteps } from '@/domain/recipeMath'
import {
  dishStage,
  isPrepLeg,
  stageIngredients,
  stageLabel,
  stageSteps,
} from '@/domain/stages'
import { unfinishedPrepLegs } from '@/db/sessionChains'
import { normalizeYoutubeUrl } from '@/domain/youtube'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { CookTimer } from '@/shared/Timer'
import { ChefTipsPanel } from '@/shared/ChefTips'
import { RecipeStoragePanel } from '@/shared/RecipeStoragePanel'
import {
  galleryItemsFromSteps,
  StepImageGallery,
  StepImageThumb,
} from '@/shared/StepImageGallery'
import { YoutubeWatchButton } from '@/shared/YoutubeWatchButton'
import { appAlert, appConfirm } from '@/shared/dialog'
import {
  AutoTextarea,
  Badge,
  Button,
  Field,
  PageHeader,
  RemoveButton,
  WarnBanner,
  inputClass,
} from '@/shared/ui'

type UsageRow = {
  ingredientId: number
  pantryItemId: number
  amountUsed: number
  measureUnit?: MeasureUnit
}

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
  measureUnit?: MeasureUnit,
): UsageRow {
  const candidates = pantry.filter((p) => p.ingredientId === ingredientId)
  return {
    ingredientId,
    pantryItemId: candidates[0]?.id ?? 0,
    amountUsed: amount,
    measureUnit,
  }
}

function capStockAmount(pantryItemId: number, amountUsed: number, pantry: PantryItem[]): number {
  if (!pantryItemId) return Math.max(0, amountUsed)
  const item = pantry.find((p) => p.id === pantryItemId)
  const max = item?.amountLeft ?? 0
  return Math.min(Math.max(0, amountUsed), max)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function usageIngredientOrder(usage: UsageRow[] | undefined): number[] {
  const order: number[] = []
  const seen = new Set<number>()
  for (const u of usage ?? []) {
    if (seen.has(u.ingredientId)) continue
    seen.add(u.ingredientId)
    order.push(u.ingredientId)
  }
  return order
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
  const [galleryStartId, setGalleryStartId] = useState<string | null>(null)
  const [addIngredientOpen, setAddIngredientOpen] = useState(false)
  const [storagePick, setStoragePick] = useState<{
    idx: number
    options: StorageOption[]
    recipeName: string
  } | null>(null)
  const dish = dishes[activeIdx]
  const recipe = dish ? recipeById.get(dish.recipeId) : undefined

  useEffect(() => {
    finishPrompted.current = false
  }, [sessionId])

  useEffect(() => {
    setGalleryStartId(null)
  }, [activeIdx, dish?.recipeId])

  useEffect(() => {
    if (dishes.length === 0) return
    if (!dishes.every((d) => d.completed)) return
    if (finishPrompted.current) return
    finishPrompted.current = true
    void (async () => {
      if (await appConfirm('All recipes in this session are cooked. Finish the cooking session now?')) {
        await finishSession(true)
      }
    })()
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

  /** Per-portion nutrition from what was actually used this cook. */
  function dishNutrition(d: SessionDishPlan): Nutrition {
    if (isPrepLeg(d)) return emptyNutrition()
    return liveNutrition(d)
  }

  function liveNutrition(d: SessionDishPlan): Nutrition {
    if (!d.usage?.length) return emptyNutrition()
    let total = emptyNutrition()
    for (const u of d.usage) {
      if (u.amountUsed <= 0) continue
      const ing = ingById.get(u.ingredientId)
      if (!ing) continue
      const item = u.pantryItemId ? pantry.find((p) => p.id === u.pantryItemId) : undefined
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
    const usage = stageIngredients(r, dishStage(d)).map((line) => {
      const ing = ingById.get(line.ingredientId)
      return defaultUsageRow(
        line.ingredientId,
        round1(line.amount * scale),
        pantry,
        ing ? measureUnitOf(line, ing) : undefined,
      )
    })
    updateDish(idx, { usage })
  }

  useEffect(() => {
    ensureUsageInitialized(activeIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, dish?.portions, recipe?.id])

  async function finishDish(
    idx: number,
    opts?: { storagePlace?: BatchStorage; skipChecks?: boolean },
  ) {
    const d = dishes[idx]
    const r = recipeById.get(d.recipeId)
    if (!r) return

    if (!opts?.skipChecks) {
      const stage = dishStage(d)
      const steps = stageSteps(r, stage)
      const stepsDone = steps.filter((s) => d.stepsDone?.includes(s.id)).length
      if (stepsDone < steps.length) {
        if (
          !(await appConfirm(
            `Only ${stepsDone} of ${steps.length} cooking steps are checked off. Mark ${
              isPrepLeg(d) ? 'stage done' : 'dish cooked'
            } anyway?`,
          ))
        ) {
          return
        }
      }

      const missingPantry: string[] = []
      for (const ingredientId of usageIngredientOrder(d.usage)) {
        const ing = ingById.get(ingredientId)
        if (isAlwaysAvailable(ing)) continue
        const rows = usageForIngredient(d, ingredientId)
        const totalUsed = rows.reduce((sum, u) => sum + u.amountUsed, 0)
        if (totalUsed <= 0) continue
        if (!rows.some((u) => u.pantryItemId > 0)) {
          missingPantry.push(ing?.name ?? 'Unknown ingredient')
        }
      }
      if (missingPantry.length > 0) {
        if (
          !(await appConfirm(
            `No pantry item selected for: ${missingPantry.join(', ')}. Finish anyway?`,
          ))
        ) {
          return
        }
      }

      for (const u of d.usage ?? []) {
        if (!u.pantryItemId || u.amountUsed <= 0) continue
        const ing = ingById.get(u.ingredientId)
        const item = pantry.find((p) => p.id === u.pantryItemId)
        if (u.amountUsed > (item?.amountLeft ?? 0)) {
          await appAlert(`Amount for ${ing?.name ?? 'ingredient'} exceeds available stock.`)
          return
        }
      }
    }

    let storagePlace = opts?.storagePlace ?? d.storagePlace
    if (!isPrepLeg(d) && !isPrepRecipe(r)) {
      const options = recipeStorageOptions(r)
      if (!storagePlace) {
        if (options.length > 1) {
          setStoragePick({ idx, options, recipeName: r.name })
          return
        }
        storagePlace = options[0]?.place ?? 'fridge'
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
    updateDish(idx, {
      completed: true,
      nutritionPerPortion: dishNutrition(d),
      ...(storagePlace ? { storagePlace } : {}),
    })
    setStoragePick(null)
  }

  async function finishSession(skipConfirm = false) {
    if (
      !skipConfirm &&
      !(await appConfirm(
        'Finish this cooking session? Portions, stock changes, and nutrition (except notes) will be locked.',
      ))
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
        const prepPlace = d.storagePlace ?? defaultStoragePlace(r)
        const pantryItem: Omit<PantryItem, 'id'> = {
          ingredientId: r.yieldIngredientId,
          brand: 'Homemade',
          amountLeft: yieldAmt,
          expiryDate: expiryFromCook(cookedAt, storageDaysFor(r, prepPlace)),
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
      const storagePlace = d.storagePlace ?? defaultStoragePlace(r)
      const batch: Omit<ReadyBatch, 'id'> = {
        recipeId: d.recipeId,
        sessionId,
        cookedAt,
        expiresAt: expiryFromCook(cookedAt, storageDaysFor(r, storagePlace)),
        storagePlace,
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
  const stepGalleryItems = galleryItemsFromSteps(stageStepList)
  const legOfChain = isPrepLeg(dish)
  const missingPrep = legOfChain ? [] : unfinishedPrepLegs(allSessions, dish)
  const youtubeHref = normalizeYoutubeUrl(recipe.youtubeUrl ?? '')

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

      {youtubeHref ? <YoutubeWatchButton href={youtubeHref} className="mt-3" /> : null}

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
              const scale = portions / recipe.portions
              const recipeIds = new Set(stageLines.map((l) => l.ingredientId))
              const nextUsage: UsageRow[] = []
              for (const line of stageLines) {
                const ing = ingById.get(line.ingredientId)
                const measure = ing ? measureUnitOf(line, ing) : undefined
                const target = round1(line.amount * scale)
                const existing = usageForIngredient(dish, line.ingredientId)
                if (existing.length > 0) {
                  nextUsage.push({
                    ...existing[0],
                    amountUsed: target,
                    measureUnit: existing[0].measureUnit ?? measure,
                  })
                  for (const extra of existing.slice(1)) {
                    nextUsage.push({ ...extra, amountUsed: 0 })
                  }
                } else {
                  nextUsage.push(defaultUsageRow(line.ingredientId, target, pantry, measure))
                }
              }
              for (const u of dish.usage ?? []) {
                if (!recipeIds.has(u.ingredientId)) nextUsage.push(u)
              }
              updateDish(activeIdx, { portions, usage: nextUsage })
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
          Ingredients & pantry
          {legOfChain ? (
            <span className="ml-2 text-sm text-ink-muted">
              ({stageLabel(stage).toLowerCase()} only)
            </span>
          ) : null}
        </h2>
        {(dish.usage?.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-muted">No ingredients yet — add what you used.</p>
        ) : null}
        <ul className="space-y-3">
          {usageIngredientOrder(dish.usage).map((ingredientId) => {
            const ing = ingById.get(ingredientId)
            const always = isAlwaysAvailable(ing)
            const candidates = pantry.filter((p) => p.ingredientId === ingredientId)
            const rows = usageForIngredient(dish, ingredientId)
            const recipeLine = stageLines.find((l) => l.ingredientId === ingredientId)
            const measure =
              rows[0]?.measureUnit ??
              (ing && recipeLine ? measureUnitOf(recipeLine, ing) : ing?.unit ?? 'g')
            const measureOptions = ing ? allowedMeasureUnits(ing) : ([measure] as MeasureUnit[])
            const neededStock = recipeLine ? round1(recipeLine.amount * scale) : undefined
            const needLabel =
              neededStock != null && ing
                ? formatRecipeAmount(neededStock, measure, ing)
                : undefined

            return (
              <li key={ingredientId} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{ing?.name ?? 'Unknown'}</span>
                    {needLabel ? (
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        Recipe {needLabel.primary}
                        {needLabel.stockHint ? ` (${needLabel.stockHint})` : ''}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-xs text-ink-muted">Added while cooking</span>
                    )}
                  </div>
                  {!dish.completed ? (
                    <RemoveButton
                      icon
                      onClick={() => {
                        updateDish(activeIdx, {
                          usage: (dish.usage ?? []).filter((u) => u.ingredientId !== ingredientId),
                        })
                      }}
                    />
                  ) : null}
                </div>
                {always ? (
                  <div className="space-y-2">
                    <p className="text-sm text-ok">Always available — not deducted from the pantry.</p>
                    <div className="flex gap-2">
                      <Field label={`Amount (${measure})`}>
                        <input
                          className={inputClass}
                          type="number"
                          min={0}
                          step="0.1"
                          disabled={dish.completed}
                          value={
                            ing
                              ? fromStockAmount(rows[0]?.amountUsed ?? 0, measure, ing)
                              : rows[0]?.amountUsed ?? 0
                          }
                          onChange={(e) => {
                            if (!ing) return
                            let stock = 0
                            try {
                              stock = toStockAmount(Number(e.target.value), measure, ing)
                            } catch {
                              return
                            }
                            updateIngredientUsage(ingredientId, [
                              {
                                ingredientId,
                                pantryItemId: 0,
                                amountUsed: Math.max(0, stock),
                                measureUnit: measure,
                              },
                            ])
                          }}
                        />
                      </Field>
                      <Field label="Unit">
                        <select
                          className={inputClass}
                          disabled={dish.completed || !ing}
                          value={measure}
                          onChange={(e) => {
                            if (!ing) return
                            const nextMeasure = e.target.value as MeasureUnit
                            const shown = fromStockAmount(rows[0]?.amountUsed ?? 0, measure, ing)
                            let stock = rows[0]?.amountUsed ?? 0
                            try {
                              stock = toStockAmount(shown, nextMeasure, ing)
                            } catch {
                              /* keep */
                            }
                            updateIngredientUsage(ingredientId, [
                              {
                                ingredientId,
                                pantryItemId: 0,
                                amountUsed: stock,
                                measureUnit: nextMeasure,
                              },
                            ])
                          }}
                        >
                          {measureOptions.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                ) : (
                  <>
                    {rows.map((row, rowIdx) => {
                      const displayAmount = ing
                        ? fromStockAmount(row.amountUsed, measure, ing)
                        : row.amountUsed
                      const stockLeft =
                        pantry.find((p) => p.id === row.pantryItemId)?.amountLeft ?? 0
                      const maxDisplay =
                        ing && row.pantryItemId
                          ? fromStockAmount(stockLeft, measure, ing)
                          : undefined
                      return (
                        <div
                          key={rowIdx}
                          className={`space-y-2 ${rowIdx > 0 ? 'mt-3 border-t border-line pt-3' : ''}`}
                        >
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
                                  amountUsed: capStockAmount(
                                    pantryItemId,
                                    row.amountUsed,
                                    pantry,
                                  ),
                                  measureUnit: measure,
                                }
                                updateIngredientUsage(ingredientId, next)
                              }}
                            >
                              {candidates.length === 0 ? (
                                <option value={0}>No stock — add to pantry</option>
                              ) : (
                                <>
                                  <option value={0}>Select pantry item…</option>
                                  {candidates.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.brand || 'Unbranded'} · {c.amountLeft} {ing?.unit} left
                                    </option>
                                  ))}
                                </>
                              )}
                            </select>
                          </Field>
                          <div className="flex gap-2">
                            <Field label={`Amount used (${measure})`}>
                              <input
                                className={inputClass}
                                type="number"
                                min={0}
                                max={maxDisplay}
                                step="0.1"
                                disabled={dish.completed}
                                value={displayAmount}
                                onChange={(e) => {
                                  if (!ing) return
                                  let stock = 0
                                  try {
                                    stock = toStockAmount(Number(e.target.value), measure, ing)
                                  } catch {
                                    return
                                  }
                                  const amountUsed = capStockAmount(
                                    row.pantryItemId,
                                    stock,
                                    pantry,
                                  )
                                  const next = [...rows]
                                  next[rowIdx] = { ...row, amountUsed, measureUnit: measure }
                                  updateIngredientUsage(ingredientId, next)
                                }}
                              />
                            </Field>
                            <Field label="Unit">
                              <select
                                className={inputClass}
                                disabled={dish.completed || !ing}
                                value={measure}
                                onChange={(e) => {
                                  if (!ing) return
                                  const nextMeasure = e.target.value as MeasureUnit
                                  const next = rows.map((r) => ({
                                    ...r,
                                    measureUnit: nextMeasure,
                                  }))
                                  updateIngredientUsage(ingredientId, next)
                                }}
                              >
                                {measureOptions.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          </div>
                          {row.pantryItemId && measure !== ing?.unit ? (
                            <p className="text-xs text-ink-muted">
                              Stock: {row.amountUsed} {ing?.unit}
                              {row.pantryItemId
                                ? ` · ${stockLeft} ${ing?.unit} available`
                                : ''}
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                    {!dish.completed && candidates.length > 1 ? (
                      <Button
                        variant="ghost"
                        className="mt-2 !py-1 !text-xs"
                        onClick={() => {
                          const usedIds = new Set(rows.map((r) => r.pantryItemId))
                          const nextItem = candidates.find((c) => c.id && !usedIds.has(c.id))
                          if (!nextItem?.id) return
                          updateIngredientUsage(ingredientId, [
                            ...rows,
                            {
                              ingredientId,
                              pantryItemId: nextItem.id,
                              amountUsed: 0,
                              measureUnit: measure,
                            },
                          ])
                        }}
                      >
                        + Add another pantry item
                      </Button>
                    ) : null}
                  </>
                )}
              </li>
            )
          })}
        </ul>
        {!dish.completed ? (
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => setAddIngredientOpen(true)}
          >
            Add ingredient
          </Button>
        ) : null}
      </section>

      <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-3 text-lg">Live nutrition / portion</h2>
        <MacroBar
          nutrition={liveNutrition(dish)}
          goals={goals}
          goalCaption="Compared to your daily targets (per portion)"
        />
      </section>

      <ChefTipsPanel recipe={recipe} />

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
                        <div className="flex gap-3">
                          {step.imageDataUrl ? (
                            <StepImageThumb
                              src={step.imageDataUrl}
                              className="h-16 w-16"
                              onOpen={() => setGalleryStartId(step.id)}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
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
                          </div>
                        </div>
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

      <RecipeStoragePanel
        fridgeDays={recipe.fridgeDays}
        freezerDays={recipe.freezerDays}
        storageDays={recipe.storageDays}
        storageEnv={recipe.storageEnv}
        storageInstructions={recipe.storageInstructions}
      />
      {dish.storagePlace ? (
        <p className="mb-4 -mt-2 text-sm text-ink-muted">
          Storing this batch in the {storageLabel(dish.storagePlace).toLowerCase()}.
        </p>
      ) : null}

      <Field label="Notes for this dish">
        <AutoTextarea
          minRows={2}
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
        <AutoTextarea
          className="mt-4"
          minRows={2}
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
      <Sheet
        open={storagePick != null}
        title="Where will you store it?"
        onClose={() => setStoragePick(null)}
      >
        {storagePick ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Choose storage for {storagePick.recipeName}. Expiry is based on the time for that
              place.
            </p>
            {storagePick.options.map((opt) => (
              <Button
                key={opt.place}
                className="w-full"
                variant={opt.place === 'fridge' ? 'primary' : 'secondary'}
                onClick={() =>
                  void finishDish(storagePick.idx, {
                    storagePlace: opt.place,
                    skipChecks: true,
                  })
                }
              >
                {storageLabel(opt.place)} · {opt.days} day{opt.days === 1 ? '' : 's'}
              </Button>
            ))}
            <Button className="w-full" variant="ghost" onClick={() => setStoragePick(null)}>
              Cancel
            </Button>
          </div>
        ) : null}
      </Sheet>
      <StepImageGallery
        open={galleryStartId != null}
        startId={galleryStartId}
        items={stepGalleryItems}
        onClose={() => setGalleryStartId(null)}
      />
      <SearchPickerSheet
        open={addIngredientOpen}
        title="Add ingredient"
        items={[...ingById.values()]
          .filter((i) => i.id != null)
          .filter((i) => !(dish.usage ?? []).some((u) => u.ingredientId === i.id))
          .map((i) => {
            const cat = INGREDIENT_CATEGORIES.find((c) => c.id === i.category)?.label
            return {
              id: i.id!,
              label: i.name,
              detail: `${cat ?? i.category} · ${i.unit}`,
              group: i.category,
              searchText: `${i.name} ${cat ?? ''} ${i.unit}`,
            }
          })}
        groups={INGREDIENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
        onClose={() => setAddIngredientOpen(false)}
        onSelect={(ingredientId) => {
          const ing = ingById.get(ingredientId)
          if (!ing) return
          const row = defaultUsageRow(ingredientId, 0, pantry, ing.unit)
          updateDish(activeIdx, { usage: [...(dish.usage ?? []), row] })
          setAddIngredientOpen(false)
        }}
      />
    </div>
  )
}
