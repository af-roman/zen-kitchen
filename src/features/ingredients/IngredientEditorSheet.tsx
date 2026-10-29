import { useEffect, useState } from 'react'
import { db } from '@/db/database'
import {
  INGREDIENT_CATEGORIES,
  type Ingredient,
  type IngredientCategory,
  type Nutrition,
  type Unit,
} from '@/domain/types'
import { gramsPerMlFromTbsp, gramsPerTbspFromMl } from '@/domain/measures'
import { Checkbox, NumberField, SelectField } from '@/shared/forms'
import { Button, Field, inputClass } from '@/shared/ui'
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
  zeroNutritionConfirmed: false,
  packSize: 0,
  averagePackPrice: 0,
  rawFridgeDays: 0,
}

export type IngredientSeed = {
  name: string
  unit?: Unit
  category?: IngredientCategory
}

export function IngredientEditorSheet({
  open,
  ingredient,
  seed,
  onClose,
  onSaved,
  zClass,
}: {
  open: boolean
  /** Existing row. Omit to create. */
  ingredient?: Ingredient | null
  /** Prefill when creating. */
  seed?: IngredientSeed | null
  onClose: () => void
  onSaved: (ingredient: Ingredient) => void
  zClass?: string
}) {
  const [form, setForm] = useState(emptyForm)

  const seedName = seed?.name ?? ''
  const seedUnit = seed?.unit ?? 'g'
  const seedCategory = seed?.category ?? 'staples'

  useEffect(() => {
    if (!open) return
    if (ingredient) {
      setForm({
        name: ingredient.name,
        category: ingredient.category,
        unit: ingredient.unit,
        avgPieceGrams: ingredient.avgPieceGrams ?? 50,
        gramsPerTbsp: gramsPerTbspFromMl(ingredient.gramsPerMl),
        energyKcal: ingredient.nutritionPer100.energyKcal,
        fatG: ingredient.nutritionPer100.fatG,
        carbsG: ingredient.nutritionPer100.carbsG,
        proteinG: ingredient.nutritionPer100.proteinG,
        zeroNutritionConfirmed: Boolean(ingredient.zeroNutritionConfirmed),
        packSize: ingredient.packSize ?? 0,
        averagePackPrice: ingredient.averagePackPrice ?? 0,
        rawFridgeDays: ingredient.rawFridgeDays ?? 0,
      })
      return
    }
    setForm({
      ...emptyForm,
      name: seedName,
      unit: seedUnit,
      category: seedCategory,
    })
    // Reload when the sheet opens or the row being edited changes, not on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ingredient?.id, seedName, seedUnit, seedCategory])

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
      gramsPerMl: form.unit === 'g' ? gramsPerMlFromTbsp(form.gramsPerTbsp) : undefined,
      nutritionPer100: nutrition,
      zeroNutritionConfirmed:
        form.zeroNutritionConfirmed &&
        nutrition.energyKcal === 0 &&
        nutrition.fatG === 0 &&
        nutrition.carbsG === 0 &&
        nutrition.proteinG === 0,
      lowStockThreshold: 0,
      packSize: form.packSize > 0 ? form.packSize : undefined,
      averagePackPrice: form.averagePackPrice > 0 ? form.averagePackPrice : 0,
      rawFridgeDays: form.rawFridgeDays > 0 ? form.rawFridgeDays : undefined,
      createdAt: ingredient?.createdAt ?? new Date().toISOString(),
      alwaysAvailable: ingredient?.alwaysAvailable,
    }
    if (ingredient?.alwaysAvailable) {
      payload = {
        ...payload,
        name: ingredient.name,
        unit: 'ml',
        alwaysAvailable: true,
        nutritionPer100: { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
        gramsPerMl: undefined,
        avgPieceGrams: undefined,
        lowStockThreshold: 0,
      }
    }
    if (ingredient?.id) {
      await db.ingredients.update(ingredient.id, payload)
      onSaved({ ...payload, id: ingredient.id })
    } else {
      const id = await db.ingredients.add(payload)
      onSaved({ ...payload, id })
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      title={ingredient ? 'Edit ingredient' : 'Add ingredient'}
      onClose={onClose}
      zClass={zClass}
    >
      <div className="space-y-3">
        {ingredient?.alwaysAvailable ? (
          <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
            Built-in tap water: always available, measured in ml (or tsp/tbsp), zero calories. Only
            the category can be changed.
          </p>
        ) : null}
        <Field label="Name">
          <input
            className={inputClass}
            value={form.name}
            disabled={Boolean(ingredient?.alwaysAvailable)}
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
            disabled={Boolean(ingredient?.alwaysAvailable)}
            onChange={(unit) => setForm({ ...form, unit })}
            options={[
              { id: 'g', label: 'grams (g)' },
              { id: 'ml', label: 'millilitres (ml)' },
              { id: 'pcs', label: 'pieces (pcs)' },
            ]}
          />
        </Field>
        {form.unit === 'pcs' && !ingredient?.alwaysAvailable ? (
          <Field label="Average weight per piece (g)">
            <NumberField
              value={form.avgPieceGrams}
              min={0}
              step={1}
              onChange={(avgPieceGrams) => setForm({ ...form, avgPieceGrams })}
            />
          </Field>
        ) : null}
        {form.unit === 'g' && !ingredient?.alwaysAvailable ? (
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
        {!ingredient?.alwaysAvailable ? (
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
                    onChange={(n) =>
                      setForm({
                        ...form,
                        [key]: n,
                        zeroNutritionConfirmed: n === 0 ? form.zeroNutritionConfirmed : false,
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <Checkbox
              checked={form.zeroNutritionConfirmed}
              disabled={
                form.energyKcal !== 0 ||
                form.fatG !== 0 ||
                form.carbsG !== 0 ||
                form.proteinG !== 0
              }
              onChange={(zeroNutritionConfirmed) => setForm({ ...form, zeroNutritionConfirmed })}
              label="These zeros are real"
              hint="Salt and similar have no energy or macros. This turns off the missing-nutrition warning."
            />
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
              label="Average pack price (Kč)"
              hint="Usual price for one pack. 0 = unknown."
            >
              <NumberField
                value={form.averagePackPrice}
                min={0}
                step={1}
                inputMode="numeric"
                onChange={(averagePackPrice) => setForm({ ...form, averagePackPrice })}
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
  )
}
