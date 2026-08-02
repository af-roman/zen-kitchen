import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  INGREDIENT_CATEGORIES,
  type Ingredient,
  type IngredientCategory,
  type Nutrition,
  type Unit,
} from '@/domain/types'
import { gramsPerMlFromTbsp, gramsPerTbspFromMl } from '@/domain/measures'
import { isAlwaysAvailable } from '@/domain/kitchen'
import { appAlert, appConfirm } from '@/shared/dialog'
import { Badge, Button, EmptyState, Field, PageHeader, inputClass } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'

const emptyForm = {
  name: '',
  category: 'staples' as IngredientCategory,
  unit: 'g' as Unit,
  avgPieceGrams: 50,
  gramsPerTbsp: 0,
  energyKcal: 0,
  fatG: 0,
  carbsG: 0,
  proteinG: 0,
  lowStockThreshold: 50,
}

export function IngredientsPage() {
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []) ?? []
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<IngredientCategory | 'all'>('all')
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const filtered = useMemo(() => {
    return ingredients.filter((i) => {
      if (category !== 'all' && i.category !== category) return false
      if (q && !i.name.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [ingredients, q, category])

  function openCreate() {
    setForm(emptyForm)
    setEditing(null)
    setCreating(true)
  }

  function openEdit(ing: Ingredient) {
    setEditing(ing)
    setForm({
      name: ing.name,
      category: ing.category,
      unit: ing.unit,
      avgPieceGrams: ing.avgPieceGrams ?? 50,
      gramsPerTbsp: gramsPerTbspFromMl(ing.gramsPerMl),
      energyKcal: ing.nutritionPer100.energyKcal,
      fatG: ing.nutritionPer100.fatG,
      carbsG: ing.nutritionPer100.carbsG,
      proteinG: ing.nutritionPer100.proteinG,
      lowStockThreshold: ing.lowStockThreshold,
    })
    setCreating(true)
  }

  async function save() {
    const nutrition: Nutrition = {
      energyKcal: form.energyKcal,
      fatG: form.fatG,
      carbsG: form.carbsG,
      proteinG: form.proteinG,
    }
    let payload: Omit<Ingredient, 'id'> = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      avgPieceGrams: form.unit === 'pcs' ? form.avgPieceGrams : undefined,
      gramsPerMl:
        form.unit === 'g' ? gramsPerMlFromTbsp(form.gramsPerTbsp) : undefined,
      nutritionPer100: nutrition,
      lowStockThreshold: form.lowStockThreshold,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      alwaysAvailable: editing?.alwaysAvailable,
    }
    if (editing?.alwaysAvailable) {
      payload = {
        ...payload,
        name: editing.name,
        unit: 'ml',
        alwaysAvailable: true,
        nutritionPer100: { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
        gramsPerMl: undefined,
        avgPieceGrams: undefined,
        lowStockThreshold: 0,
      }
    }
    if (editing?.id) {
      await db.ingredients.update(editing.id, payload)
    } else {
      await db.ingredients.add(payload)
    }
    setCreating(false)
  }

  async function remove(id: number) {
    const ing = ingredients.find((i) => i.id === id)
    if (isAlwaysAvailable(ing)) {
      await appAlert('Tap water is built-in and cannot be deleted.')
      return
    }
    if (!(await appConfirm('Delete this ingredient? Pantry items that use it will remain orphaned.', { danger: true, confirmLabel: 'Delete' }))) return
    await db.ingredients.delete(id)
  }

  return (
    <div>
      <PageHeader
        title="Ingredient library"
        subtitle="The building blocks for recipes, pantry, and restocks."
        actions={<Button onClick={openCreate}>Add</Button>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          className={inputClass}
          placeholder="Search ingredients…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={inputClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as IngredientCategory | 'all')}
        >
          <option value="all">All categories</option>
          {INGREDIENT_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No ingredients" body="Add your first ingredient to get started." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((ing) => (
            <li
              key={ing.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-paper-elevated px-3 py-3"
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(ing)}>
                <div className="font-medium">{ing.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>
                    {INGREDIENT_CATEGORIES.find((c) => c.id === ing.category)?.label}
                  </Badge>
                  <Badge tone="accent">{ing.unit}</Badge>
                  {isAlwaysAvailable(ing) ? <Badge tone="ok">Always available</Badge> : null}
                  {ing.unit === 'g' && ing.gramsPerMl != null ? (
                    <Badge>spoons ok</Badge>
                  ) : null}
                  <span className="text-xs text-ink-muted">
                    {ing.nutritionPer100.energyKcal} kcal / 100
                    {ing.unit === 'pcs' ? 'g' : ing.unit}
                  </span>
                </div>
              </button>
              {isAlwaysAvailable(ing) ? null : (
                <Button variant="ghost" onClick={() => void remove(ing.id!)}>
                  Delete
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={creating}
        title={editing ? 'Edit ingredient' : 'Add ingredient'}
        onClose={() => setCreating(false)}
      >
        <div className="space-y-3">
          {editing?.alwaysAvailable ? (
            <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
              Built-in tap water: always available, measured in ml (or tsp/tbsp), zero calories.
              Only the category can be changed.
            </p>
          ) : null}
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              disabled={Boolean(editing?.alwaysAvailable)}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Category">
            <select
              className={inputClass}
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as IngredientCategory })
              }
            >
              {INGREDIENT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unit">
            <select
              className={inputClass}
              value={form.unit}
              disabled={Boolean(editing?.alwaysAvailable)}
              onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}
            >
              <option value="g">grams (g)</option>
              <option value="ml">millilitres (ml)</option>
              <option value="pcs">pieces (pcs)</option>
            </select>
          </Field>
          {form.unit === 'pcs' && !editing?.alwaysAvailable ? (
            <Field label="Average weight per piece (g)">
              <input
                className={inputClass}
                type="number"
                value={form.avgPieceGrams}
                onChange={(e) => setForm({ ...form, avgPieceGrams: Number(e.target.value) })}
              />
            </Field>
          ) : null}
          {form.unit === 'g' && !editing?.alwaysAvailable ? (
            <Field
              label="Grams per tablespoon (optional)"
              hint="Lets recipes use tsp/tbsp for this solid. Stock stays in grams."
            >
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.1"
                value={form.gramsPerTbsp || ''}
                placeholder="e.g. 18 for salt"
                onChange={(e) => setForm({ ...form, gramsPerTbsp: Number(e.target.value) })}
              />
            </Field>
          ) : null}
          {!editing?.alwaysAvailable ? (
            <>
              <p className="text-xs text-ink-muted">
                Nutrition per 100{form.unit === 'ml' ? 'ml' : 'g'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['energyKcal', 'Energy (kcal)'],
                    ['fatG', 'Fat (g)'],
                    ['carbsG', 'Carbs (g)'],
                    ['proteinG', 'Protein (g)'],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      className={inputClass}
                      type="number"
                      step="0.1"
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
                    />
                  </Field>
                ))}
              </div>
              <Field
                label="Low-stock threshold"
                hint="Warn when total pantry amount falls to this or below."
              >
                <input
                  className={inputClass}
                  type="number"
                  value={form.lowStockThreshold}
                  onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                />
              </Field>
            </>
          ) : null}
          <Button className="w-full" onClick={() => void save()} disabled={!form.name.trim()}>
            Save ingredient
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
