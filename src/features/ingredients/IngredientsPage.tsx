import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { NumberField, SelectField } from '@/shared/forms'
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
  packSize: 0,
  rawFridgeDays: 0,
}

export function IngredientsPage() {
  const navigate = useNavigate()
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
      packSize: ing.packSize ?? 0,
      rawFridgeDays: ing.rawFridgeDays ?? 0,
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
      packSize: form.packSize > 0 ? form.packSize : undefined,
      rawFridgeDays: form.rawFridgeDays > 0 ? form.rawFridgeDays : undefined,
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
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/more')}>
              Back
            </Button>
            <Button onClick={openCreate}>Add</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          className={inputClass}
          placeholder="Search ingredients…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SelectField
          title="Category"
          value={category}
          onChange={setCategory}
          options={[
            { id: 'all', label: 'All categories' },
            ...INGREDIENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
          ]}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No ingredients" body="Add your first ingredient to get started." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((ing) => (
            <li
              key={ing.id}
              className="flex items-center justify-between gap-3 card-elevated px-3 py-3"
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
            <SelectField
              title="Category"
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              options={INGREDIENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
            />
          </Field>
          <Field label="Unit">
            <SelectField
              title="Unit"
              value={form.unit}
              disabled={Boolean(editing?.alwaysAvailable)}
              onChange={(unit) => setForm({ ...form, unit })}
              options={[
                { id: 'g', label: 'grams (g)' },
                { id: 'ml', label: 'millilitres (ml)' },
                { id: 'pcs', label: 'pieces (pcs)' },
              ]}
            />
          </Field>
          {form.unit === 'pcs' && !editing?.alwaysAvailable ? (
            <Field label="Average weight per piece (g)">
              <NumberField
                value={form.avgPieceGrams}
                min={0}
                step={1}
                onChange={(avgPieceGrams) => setForm({ ...form, avgPieceGrams })}
              />
            </Field>
          ) : null}
          {form.unit === 'g' && !editing?.alwaysAvailable ? (
            <Field
              label="Grams per tablespoon (optional)"
              hint="Lets recipes use tsp/tbsp for this solid. Stock stays in grams."
            >
              <NumberField
                value={form.gramsPerTbsp || 0}
                min={0}
                step={0.1}
                onChange={(gramsPerTbsp) => setForm({ ...form, gramsPerTbsp })}
              />
            </Field>
          ) : null}
          {!editing?.alwaysAvailable ? (
            <>
              <p className="text-xs text-ink-muted">
                Nutrition per 100{form.unit === 'ml' ? 'ml' : 'g'}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ['energyKcal', 'Energy (kcal)'],
                    ['fatG', 'Fat (g)'],
                    ['carbsG', 'Carbs (g)'],
                    ['proteinG', 'Protein (g)'],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <NumberField
                      value={form[key]}
                      min={0}
                      step={0.1}
                      onChange={(n) => setForm({ ...form, [key]: n })}
                    />
                  </Field>
                ))}
              </div>
              <Field
                label="Low-stock threshold"
                hint="Warn when total pantry amount falls to this or below."
              >
                <NumberField
                  value={form.lowStockThreshold}
                  min={0}
                  step={1}
                  onChange={(lowStockThreshold) => setForm({ ...form, lowStockThreshold })}
                />
              </Field>
              <Field
                label={`Pack size (${form.unit})`}
                hint="Typical buy size. Shopping rounds shortfalls up to whole packs."
              >
                <NumberField
                  value={form.packSize}
                  min={0}
                  step={1}
                  onChange={(packSize) => setForm({ ...form, packSize })}
                />
              </Field>
              <Field
                label="Raw fridge life (days)"
                hint="How long a pack keeps after buy/open. 0 = unknown."
              >
                <NumberField
                  value={form.rawFridgeDays}
                  min={0}
                  step={1}
                  inputMode="numeric"
                  onChange={(rawFridgeDays) => setForm({ ...form, rawFridgeDays })}
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
