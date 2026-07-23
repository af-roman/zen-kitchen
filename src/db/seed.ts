import { db } from './database'
import { SEED_INGREDIENTS, SEED_RECIPE_DRAFTS } from './seed-data'
import type { Recipe } from '@/domain/types'

const SCHEMA_VERSION = 1

export async function ensureSeeded(): Promise<void> {
  const meta = await db.meta.get(1)
  if (meta?.seededAt) return

  await db.transaction(
    'rw',
    [db.goals, db.ingredients, db.recipes, db.pantryItems, db.meta],
    async () => {
      const existingGoals = await db.goals.get(1)
      if (!existingGoals) {
        await db.goals.put({
          id: 1,
          dailyKcal: 2000,
          carbsPct: 40,
          proteinPct: 30,
          fatPct: 30,
        })
      }

      const ingredientCount = await db.ingredients.count()
      if (ingredientCount === 0) {
        const now = new Date().toISOString()
        const ids = await db.ingredients.bulkAdd(
          SEED_INGREDIENTS.map((ing) => ({ ...ing, createdAt: now })),
          { allKeys: true },
        )
        const all = await db.ingredients.bulkGet(ids as number[])
        const byName = new Map(
          all.filter(Boolean).map((i) => [i!.name.toLowerCase(), i!.id!]),
        )

        const recipes: Recipe[] = SEED_RECIPE_DRAFTS.map((draft) => {
          const { ingredientNames, ...rest } = draft
          return {
            ...rest,
            ingredients: ingredientNames.map((line) => {
              const id = byName.get(line.name.toLowerCase())
              if (!id) throw new Error(`Missing seed ingredient: ${line.name}`)
              return { ingredientId: id, amount: line.amount }
            }),
            createdAt: now,
            updatedAt: now,
          }
        })
        await db.recipes.bulkAdd(recipes)

        // Starter pantry so cookable-now and first week work out of the box
        const pantryRows = all.filter(Boolean).map((ing) => ({
          ingredientId: ing!.id!,
          brand: 'Starter',
          amountLeft:
            ing!.unit === 'pcs'
              ? Math.max(ing!.lowStockThreshold * 3, 12)
              : Math.max(ing!.lowStockThreshold * 4, 400),
          createdAt: now,
          updatedAt: now,
        }))
        await db.pantryItems.bulkAdd(pantryRows)
      }

      await db.meta.put({
        id: 1,
        schemaVersion: SCHEMA_VERSION,
        seededAt: new Date().toISOString(),
      })
    },
  )
}
