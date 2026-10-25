import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  INGREDIENT_CATEGORIES,
  type Ingredient,
  type IngredientCategory,
  type Nutrition,
  type PantryItem,
} from '@/domain/types'
import { isLowStock, isOutOfStock } from '@/domain/kitchen'
import { formatExpiryLabel } from '@/domain/servings'
import { suggestedExpiryFromIngredient } from '@/domain/pantryOrder'
import { ImageUploadField } from '@/shared/ImageUploadField'
import { appConfirm } from '@/shared/dialog'
import { assetUrl } from '@/shared/assetUrl'
import { Checkbox, DateField, NumberField, SelectField } from '@/shared/forms'
import { Badge, Button, EmptyState, Field, PageHeader, WarnBanner, inputClass } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'

type StockFilter = 'all' | 'in' | 'low' | 'out'
type SortKey = 'name' | 'amount' | 'expiry'

export function PantryPage() {
  const navigate = useNavigate()
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const items = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  const [q, setQ] = useState('')
  const [category, setCategory] = useState<IngredientCategory | 'all'>('all')
  const [stock, setStock] = useState<StockFilter>('all')
  const [sort, setSort] = useState<SortKey>('name')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PantryItem | null>(null)

  const filtered = useMemo(() => {
    let list = items.map((item) => ({ item, ing: byId.get(item.ingredientId) }))
    list = list.filter(({ item, ing }) => {
      if (!ing) return false
      if (category !== 'all' && ing.category !== category) return false
      const hay = `${ing.name} ${item.brand}`.toLowerCase()
      if (q && !hay.includes(q.toLowerCase())) return false
      const low = isLowStock(item.amountLeft, ing.lowStockThreshold)
      const out = isOutOfStock(item.amountLeft)
      if (stock === 'in' && out) return false
      if (stock === 'low' && !low) return false
      if (stock === 'out' && !out) return false
      return true
    })
    list.sort((a, b) => {
      if (sort === 'amount') return a.item.amountLeft - b.item.amountLeft
      if (sort === 'expiry') {
        return (a.item.expiryDate ?? '9999').localeCompare(b.item.expiryDate ?? '9999')
      }
      return (a.ing?.name ?? '').localeCompare(b.ing?.name ?? '')
    })
    return list
  }, [items, byId, q, category, stock, sort])

  function startCreate() {
    setEditing(null)
    setOpen(true)
  }

  function startEdit(item: PantryItem) {
    setEditing(item)
    setOpen(true)
  }

  const shortCount = useMemo(() => {
    return items.filter((item) => {
      const ing = byId.get(item.ingredientId)
      if (!ing) return false
      return isOutOfStock(item.amountLeft) || isLowStock(item.amountLeft, ing.lowStockThreshold)
    }).length
  }, [items, byId])

  return (
    <div>
      <PageHeader
        title="Pantry"
        subtitle="What you have on the shelf — brands, amounts, and expiry."
        actions={<Button onClick={startCreate}>Add item</Button>}
      />
      {shortCount > 0 ? (
        <div className="mb-4">
          <WarnBanner>
            {shortCount} item{shortCount === 1 ? '' : 's'} low or out ·{' '}
            <Link to="/shopping" className="font-medium underline">
              Open shopping list
            </Link>
          </WarnBanner>
        </div>
      ) : null}
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <input
          className={inputClass}
          placeholder="Search pantry…"
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
        <SelectField
          title="Stock"
          value={stock}
          onChange={setStock}
          options={[
            { id: 'all', label: 'Any stock' },
            { id: 'in', label: 'In stock' },
            { id: 'low', label: 'Low stock' },
            { id: 'out', label: 'Out of stock' },
          ]}
        />
        <SelectField
          title="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { id: 'name', label: 'Sort A–Z' },
            { id: 'amount', label: 'Sort by amount' },
            { id: 'expiry', label: 'Sort by expiry' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Pantry is empty"
          body="Add a pantry item here, or mark a purchase under Shop."
          actions={
            <Button variant="secondary" onClick={() => navigate('/shopping')}>
              Open Shop
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {filtered.map(({ item, ing }) => {
            if (!ing) return null
            const low = isLowStock(item.amountLeft, ing.lowStockThreshold)
            const out = isOutOfStock(item.amountLeft)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="flex w-full gap-3 px-1 py-3 text-left transition hover:bg-ink/[0.03]"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-line/40">
                    {item.imageDataUrl ? (
                      <img src={assetUrl(item.imageDataUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-ink-muted">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{ing.name}</div>
                    <div className="text-sm text-ink-muted">{item.brand || 'No brand'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={out ? 'warn' : low ? 'warn' : 'ok'}>
                        {item.amountLeft} {ing.unit} left
                      </Badge>
                      {item.expiryDate ? (
                        <Badge tone={formatExpiryLabel(item.expiryDate).includes('expired') ? 'warn' : 'neutral'}>
                          {formatExpiryLabel(item.expiryDate)}
                        </Badge>
                      ) : (
                        <Badge>No expiry date</Badge>
                      )}
                      {low || out ? <Badge tone="warn">{out ? 'Out of stock' : 'Running low'}</Badge> : null}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <PantryItemSheet
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        ingredients={ingredients}
      />
    </div>
  )
}

function PantryItemSheet({
  open,
  onClose,
  editing,
  ingredients,
}: {
  open: boolean
  onClose: () => void
  editing: PantryItem | null
  ingredients: Ingredient[]
}) {
  const [ingredientId, setIngredientId] = useState(0)
  const [brand, setBrand] = useState('')
  const [amountLeft, setAmountLeft] = useState(0)
  const [expiryDate, setExpiryDate] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>()
  const [override, setOverride] = useState(false)
  const [nutrition, setNutrition] = useState<Nutrition>({
    energyKcal: 0,
    fatG: 0,
    carbsG: 0,
    proteinG: 0,
  })

  const ing = ingredients.find((i) => i.id === (editing?.ingredientId ?? ingredientId))

  useEffect(() => {
    if (!open) return
    if (editing) {
      setIngredientId(editing.ingredientId)
      setBrand(editing.brand)
      setAmountLeft(editing.amountLeft)
      setExpiryDate(editing.expiryDate ?? '')
      setImageDataUrl(editing.imageDataUrl)
      setOverride(Boolean(editing.nutritionOverride))
      setNutrition(
        editing.nutritionOverride ?? {
          energyKcal: 0,
          fatG: 0,
          carbsG: 0,
          proteinG: 0,
        },
      )
    } else {
      const first = ingredients[0]
      setIngredientId(first?.id ?? 0)
      setBrand('')
      setAmountLeft(0)
      setExpiryDate(suggestedExpiryFromIngredient(first) ?? '')
      setImageDataUrl(undefined)
      setOverride(false)
    }
  }, [open, editing, ingredients])

  async function save() {
    const id = editing?.ingredientId ?? ingredientId
    if (!id) return
    const now = new Date().toISOString()
    const payload: Omit<PantryItem, 'id'> = {
      ingredientId: id,
      brand: brand.trim(),
      amountLeft,
      expiryDate: expiryDate || undefined,
      imageDataUrl,
      nutritionOverride: override ? nutrition : undefined,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    }
    if (editing?.id) await db.pantryItems.update(editing.id, payload)
    else await db.pantryItems.add(payload)
    onClose()
  }

  async function remove() {
    if (!editing?.id) return
    if (!(await appConfirm('Remove this pantry item?', { danger: true, confirmLabel: 'Remove' }))) return
    await db.pantryItems.delete(editing.id)
    onClose()
  }

  return (
    <Sheet open={open} title={editing ? 'Edit pantry item' : 'Add pantry item'} onClose={onClose}>
      <div className="space-y-3">
        {!editing && ingredients.length === 0 ? (
          <WarnBanner>Add ingredients in the Ingredient library first.</WarnBanner>
        ) : null}
        <Field label="Ingredient">
          <SelectField
            title="Ingredient"
            value={editing ? editing.ingredientId : ingredientId}
            disabled={Boolean(editing)}
            onChange={(id) => {
              setIngredientId(id)
              if (!editing && !expiryDate) {
                const next = ingredients.find((i) => i.id === id)
                const suggested = suggestedExpiryFromIngredient(next)
                if (suggested) setExpiryDate(suggested)
              }
            }}
            options={ingredients.map((i) => ({ id: i.id!, label: i.name }))}
          />
        </Field>
        <ImageUploadField value={imageDataUrl} onChange={setImageDataUrl} />
        <Field label="Brand">
          <input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field label={`Amount left (${ing?.unit ?? 'unit'})`}>
          <NumberField value={amountLeft} min={0} step={1} onChange={setAmountLeft} />
        </Field>
        <Field label="Expiry date">
          <DateField
            value={expiryDate}
            onChange={setExpiryDate}
            title="Expiry date"
            allowEmpty
            emptyLabel="No expiry"
          />
        </Field>
        <Checkbox
          checked={override}
          onChange={setOverride}
          label="Override nutrition for this product"
        />
        {override ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ['energyKcal', 'Energy'],
                ['fatG', 'Fat'],
                ['carbsG', 'Carbs'],
                ['proteinG', 'Protein'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <NumberField
                  value={nutrition[key]}
                  min={0}
                  step={0.1}
                  onChange={(n) => setNutrition({ ...nutrition, [key]: n })}
                />
              </Field>
            ))}
          </div>
        ) : null}
        <Button className="w-full" onClick={() => void save()}>
          Save pantry item
        </Button>
        {editing ? (
          <Button variant="danger" className="w-full" onClick={() => void remove()}>
            Delete
          </Button>
        ) : null}
      </div>
    </Sheet>
  )
}
