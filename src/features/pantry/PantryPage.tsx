import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { ImageUploadField } from '@/shared/ImageUploadField'
import { assetUrl } from '@/shared/assetUrl'
import { Badge, Button, EmptyState, Field, PageHeader, WarnBanner, inputClass } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'

type StockFilter = 'all' | 'in' | 'low' | 'out'
type SortKey = 'name' | 'amount' | 'expiry'

export function PantryPage() {
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
        <select
          className={inputClass}
          value={stock}
          onChange={(e) => setStock(e.target.value as StockFilter)}
        >
          <option value="all">Any stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="name">Sort A–Z</option>
          <option value="amount">Sort by amount</option>
          <option value="expiry">Sort by expiry</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Pantry is empty" body="Add a pantry item or record a restock from Shopping." />
      ) : (
        <ul className="space-y-3">
          {filtered.map(({ item, ing }) => {
            if (!ing) return null
            const low = isLowStock(item.amountLeft, ing.lowStockThreshold)
            const out = isOutOfStock(item.amountLeft)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="flex w-full gap-3 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-3 text-left transition hover:border-accent/40"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-line/40">
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
      setIngredientId(ingredients[0]?.id ?? 0)
      setBrand('')
      setAmountLeft(0)
      setExpiryDate('')
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
    if (!confirm('Remove this pantry item?')) return
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
          <select
            className={inputClass}
            value={editing ? editing.ingredientId : ingredientId}
            disabled={Boolean(editing)}
            onChange={(e) => setIngredientId(Number(e.target.value))}
          >
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <ImageUploadField value={imageDataUrl} onChange={setImageDataUrl} />
        <Field label="Brand">
          <input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field label={`Amount left (${ing?.unit ?? 'unit'})`}>
          <input
            className={inputClass}
            type="number"
            value={amountLeft}
            onChange={(e) => setAmountLeft(Number(e.target.value))}
          />
        </Field>
        <Field label="Expiry date">
          <input
            className={inputClass}
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          Override nutrition for this product
        </label>
        {override ? (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['energyKcal', 'Energy'],
                ['fatG', 'Fat'],
                ['carbsG', 'Carbs'],
                ['proteinG', 'Protein'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  className={inputClass}
                  type="number"
                  value={nutrition[key]}
                  onChange={(e) => setNutrition({ ...nutrition, [key]: Number(e.target.value) })}
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
