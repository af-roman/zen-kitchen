import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import { syncPlanShopping } from '@/db/shoppingOps'
import {
  INGREDIENT_CATEGORIES,
  type IngredientCategory,
  type Restock,
  type RestockLine,
  type ShopHorizon,
  type ShoppingListItem,
} from '@/domain/types'
import { todayISO, uid } from '@/domain/kitchen'
import { suggestedExpiryFromIngredient } from '@/domain/pantryOrder'
import { ImageUploadField } from '@/shared/ImageUploadField'
import { appAlert, appConfirm } from '@/shared/dialog'
import { Checkbox, DateField, NumberField, SelectField } from '@/shared/forms'
import { IconCheck, IconPlus, IconShop } from '@/shared/icons'
import { Badge, Button, EmptyState, Field, PageHeader, RemoveButton, SegmentedControl, WarnBanner, inputClass, AutoTextarea } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'

type RestockPrefill = {
  lines: RestockLine[]
  notes: string
  shoppingListId?: number
  /** Shopping-list item ids to remove after a successful restock save */
  purchasedItemIds?: string[]
}

export function ShoppingPage() {
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const restocks = useLiveQuery(() => db.restocks.orderBy('date').reverse().toArray(), []) ?? []
  const sessionsQ = useLiveQuery(() => db.cookingSessions.toArray())
  const pantryQ = useLiveQuery(() => db.pantryItems.toArray())
  const recipesQ = useLiveQuery(() => db.recipes.toArray())
  const openListsQ = useLiveQuery(() => db.shoppingLists.where('status').equals('open').toArray())
  const openLists = openListsQ ?? []
  const shoppingList = openLists[0] ?? null
  const listCount = shoppingList?.items.length ?? 0

  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  const [restockOpen, setRestockOpen] = useState(false)
  const [editing, setEditing] = useState<Restock | null>(null)
  const [prefill, setPrefill] = useState<RestockPrefill | null>(null)
  const [listSheetOpen, setListSheetOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [horizon, setHorizon] = useState<ShopHorizon>('next')
  const [throughDate, setThroughDate] = useState(() =>
    format(addDays(parseISO(todayISO()), 6), 'yyyy-MM-dd'),
  )
  const [hydrated, setHydrated] = useState(false)
  const [storeFilter, setStoreFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<IngredientCategory | 'all'>('all')

  const listItems = shoppingList?.items ?? []
  const listItemIds = useMemo(() => new Set(listItems.map((i) => i.id)), [listItems])

  // Drop selections for items that are no longer on the list.
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => listItemIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [listItemIds])

  useEffect(() => {
    if (hydrated || openListsQ === undefined) return
    if (shoppingList?.horizon) setHorizon(shoppingList.horizon)
    if (shoppingList?.horizonDate) setThroughDate(shoppingList.horizonDate)
    setHydrated(true)
  }, [openListsQ, shoppingList, hydrated])

  const planKey = useMemo(() => {
    if (
      !hydrated ||
      sessionsQ === undefined ||
      pantryQ === undefined ||
      recipesQ === undefined
    ) {
      return ''
    }
    const sessionBits = sessionsQ
      .map(
        (s) =>
          `${s.id}:${s.date}:${s.status}:${s.dishes
            .map((d) => `${d.recipeId}:${d.portions}:${d.completed ? 1 : 0}`)
            .join(',')}`,
      )
      .join('|')
    const stockBits = pantryQ.map((p) => `${p.id}:${p.amountLeft}`).join('|')
    return `${horizon}|${throughDate}|${sessionBits}|${stockBits}|${ingredients.length}|${restocks.length}`
  }, [
    sessionsQ,
    pantryQ,
    recipesQ,
    hydrated,
    horizon,
    throughDate,
    ingredients.length,
    restocks.length,
  ])

  useEffect(() => {
    if (!planKey || restockOpen || listSheetOpen) return
    if (sessionsQ === undefined || pantryQ === undefined || recipesQ === undefined) return
    void syncPlanShopping({
      horizon,
      throughDate,
      today: todayISO(),
      sessions: sessionsQ,
      recipes: recipesQ,
      ingredients,
      pantry: pantryQ,
      restocks,
    })
  }, [planKey, restockOpen, listSheetOpen, horizon, throughDate, sessionsQ, pantryQ, recipesQ, ingredients, restocks])

  const selectedItems = useMemo(
    () => listItems.filter((i) => selectedIds.has(i.id)),
    [listItems, selectedIds],
  )
  const allSelected = listItems.length > 0 && selectedItems.length === listItems.length

  function storeName(store: string): string {
    return store.trim() || 'No store'
  }

  const stores = useMemo(() => {
    const set = new Set(listItems.map((item) => storeName(item.store)))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [listItems])

  const visibleItems = useMemo(
    () =>
      listItems.filter((item) => {
        const ing = ingById.get(item.ingredientId)
        if (storeFilter !== 'all' && storeName(item.store) !== storeFilter) return false
        if (categoryFilter !== 'all' && ing?.category !== categoryFilter) return false
        return true
      }),
    [listItems, ingById, storeFilter, categoryFilter],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, ShoppingListItem[]>()
    for (const item of visibleItems) {
      const key = storeName(item.store)
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visibleItems])

  const visibleTotal = visibleItems.reduce((s, i) => s + (Number(i.cost) || 0), 0)
  const selectedStores = useMemo(() => {
    const set = new Set(
      selectedItems.map((i) => i.store.trim()).filter((s) => s.length > 0),
    )
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [selectedItems])

  async function ensureOpenList(): Promise<number> {
    if (shoppingList?.id != null) return shoppingList.id
    const nowIso = new Date().toISOString()
    return db.shoppingLists.add({
      items: [],
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
    })
  }

  function startCreateRestock() {
    setEditing(null)
    setPrefill(null)
    setRestockOpen(true)
  }

  function startEditRestock(restock: Restock) {
    setEditing(restock)
    setPrefill(null)
    setRestockOpen(true)
  }

  function closeRestockSheet() {
    setRestockOpen(false)
    setEditing(null)
    setPrefill(null)
  }

  function startAddListItem() {
    setEditingItem(null)
    setListSheetOpen(true)
  }

  function startEditListItem(item: ShoppingListItem) {
    setEditingItem(item)
    setListSheetOpen(true)
  }

  async function saveListItem(item: Omit<ShoppingListItem, 'id'> & { id?: string }) {
    const listId = await ensureOpenList()
    const list = (await db.shoppingLists.get(listId))!
    const previous = item.id ? list.items.find((i) => i.id === item.id) : undefined
    const nextItem: ShoppingListItem = {
      id: item.id ?? uid(),
      ingredientId: item.ingredientId,
      amount: item.amount,
      brand: item.brand.trim(),
      cost: item.cost,
      store: item.store.trim(),
      notes: item.notes?.trim() || undefined,
      source: previous?.source ?? 'manual',
    }
    const items = item.id
      ? list.items.map((i) => (i.id === item.id ? nextItem : i))
      : [...list.items, nextItem]
    await db.shoppingLists.update(listId, {
      items,
      updatedAt: new Date().toISOString(),
    })
    setListSheetOpen(false)
    setEditingItem(null)
  }

  async function removeListItem(itemId: string) {
    if (!shoppingList?.id) return
    await db.shoppingLists.update(shoppingList.id, {
      items: shoppingList.items.filter((i) => i.id !== itemId),
      updatedAt: new Date().toISOString(),
    })
  }

  function toggleSelected(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(listItems.map((i) => i.id)))
  }

  async function markPurchased() {
    if (!shoppingList?.id || listItems.length === 0) {
      await appAlert('Add items to the shopping list first.')
      return
    }
    if (selectedItems.length === 0) {
      await appAlert('Select the items you purchased first.')
      return
    }
    const storeNote =
      selectedStores.length > 0 ? `Stores: ${selectedStores.join(', ')}` : ''
    const lines: RestockLine[] = selectedItems.map((i) => ({
      ingredientId: i.ingredientId,
      brand: i.brand,
      amount: i.amount,
      cost: i.cost,
      expiryDate: suggestedExpiryFromIngredient(ingById.get(i.ingredientId)),
    }))
    setEditing(null)
    setPrefill({
      lines,
      notes: storeNote,
      shoppingListId: shoppingList.id,
      purchasedItemIds: selectedItems.map((i) => i.id),
    })
    setRestockOpen(true)
  }

  async function onRestockSavedFromList(listId: number, purchasedItemIds: string[]) {
    const list = await db.shoppingLists.get(listId)
    if (!list) return
    const remaining = list.items.filter((i) => !purchasedItemIds.includes(i.id))
    const nowIso = new Date().toISOString()
    if (remaining.length === 0) {
      await db.shoppingLists.update(listId, {
        status: 'purchased',
        purchasedAt: nowIso,
        updatedAt: nowIso,
        items: [],
      })
    } else {
      await db.shoppingLists.update(listId, {
        items: remaining,
        updatedAt: nowIso,
      })
    }
    setSelectedIds(new Set())
  }

  return (
    <div>
      <PageHeader
        title="Shop"
        icon={<IconShop className="h-5 w-5" />}
        subtitle={
          listCount > 0
            ? `${visibleItems.length} shown · ${visibleTotal.toFixed(0)} Kč`
            : 'Check things off as you go.'
        }
        actions={
          <Button variant="secondary" className="gap-1.5" onClick={startAddListItem}>
            <IconPlus className="h-4 w-4" />
            Add
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {listItems.length > 0 ? (
          <>
            <Button
              className="flex-1 gap-2"
              disabled={selectedItems.length === 0}
              onClick={() => void markPurchased()}
            >
              <IconCheck className="h-4 w-4" />
              Bought{selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
            </Button>
            <Button variant="secondary" onClick={toggleSelectAll}>
              {allSelected ? 'None' : 'All'}
            </Button>
          </>
        ) : null}
        <Button variant="ghost" onClick={startCreateRestock}>
          Restock
        </Button>
      </div>

      <section className="mb-4 space-y-3">
        <SegmentedControl
          value={horizon}
          onChange={setHorizon}
          options={[
            { id: 'next', label: 'Next cook' },
            { id: 'through', label: 'Through date' },
          ]}
        />
        {horizon === 'through' ? (
          <Field label="Shop through">
            <DateField title="Shop through" value={throughDate} onChange={setThroughDate} />
          </Field>
        ) : null}
        <p className="text-sm text-ink-muted">
          Amounts follow the cooks in this horizon. Store and a price you type stay put. Hand-added
          items stay on the list.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={storeFilter === 'all' ? 'primary' : 'secondary'}
            className="!py-1 !text-xs"
            onClick={() => setStoreFilter('all')}
          >
            All stores
          </Button>
          {stores.map((store) => (
            <Button
              key={store}
              variant={storeFilter === store ? 'primary' : 'secondary'}
              className="!py-1 !text-xs"
              onClick={() => setStoreFilter(store)}
            >
              {store}
            </Button>
          ))}
        </div>
        <Field label="Category">
          <SelectField<IngredientCategory | 'all'>
            title="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { id: 'all', label: 'All categories' },
              ...INGREDIENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
            ]}
          />
        </Field>
      </section>

      <section className="mb-6">

        {visibleItems.length === 0 ? (
          <EmptyState
            title={listItems.length === 0 ? 'List is empty' : 'Nothing in this filter'}
            body={
              listItems.length === 0
                ? 'The next cook’s shortfalls appear here. You can still add something by hand.'
                : 'Clear the store or category filter to see the rest of the list.'
            }
          />
        ) : (
          <>
            <div className="space-y-5">
              {grouped.map(([store, items]) => {
                const subtotal = items.reduce((s, i) => s + (Number(i.cost) || 0), 0)
                return (
                  <section key={store}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h2 className="text-lg">{store}</h2>
                      <span className="text-sm text-ink-muted">{subtotal.toFixed(0)} Kč</span>
                    </div>
                    <ul className="space-y-2">
                      {items.map((item) => {
                        const ing = ingById.get(item.ingredientId)
                        const checked = selectedIds.has(item.id)
                        return (
                          <li
                            key={item.id}
                            className={`flex items-stretch gap-2 rounded-[var(--radius-card)] bg-paper-elevated shadow-card transition ${
                              checked ? 'opacity-45' : ''
                            }`}
                          >
                            <div className="flex items-center px-3">
                              <Checkbox
                                checked={checked}
                                onChange={() => toggleSelected(item.id)}
                                label={<span className="sr-only">Select {ing?.name ?? 'item'}</span>}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => startEditListItem(item)}
                              className="min-w-0 flex-1 px-1 py-3 pr-3 text-left"
                            >
                              <div className="flex justify-between gap-2">
                                <span className="font-medium">{ing?.name ?? 'Ingredient'}</span>
                                <span>{(Number(item.cost) || 0).toFixed(0)} Kč</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5 text-sm text-ink-muted">
                                <span>
                                  {item.amount || '—'} {ing?.unit}
                                </span>
                                <span>·</span>
                                <span>{item.brand || 'No brand'}</span>
                                {item.source === 'plan' ? <Badge>From plan</Badge> : <Badge>Added</Badge>}
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg">Restock history</h2>
        {restocks.length === 0 ? (
          <EmptyState title="No restocks yet" body="Log a purchase to update the pantry." />
        ) : (
          <ul className="space-y-2">
            {restocks.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => startEditRestock(r)}
                  className="w-full border-b border-line px-1 py-3 text-left transition hover:bg-ink/[0.03]"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{format(parseISO(r.date), 'd MMM yyyy')}</span>
                    <span>{r.totalCost.toFixed(0)} Kč</span>
                  </div>
                  <ul className="mt-1 text-sm text-ink-muted">
                    {r.lines.map((line, idx) => (
                      <li key={idx}>
                        {ingById.get(line.ingredientId)?.name} · {line.amount}{' '}
                        {ingById.get(line.ingredientId)?.unit} · {line.brand || '—'}
                      </li>
                    ))}
                  </ul>
                  {r.notes ? (
                    <p className="mt-1 text-xs text-ink-muted">{r.notes}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ShoppingListItemSheet
        open={listSheetOpen}
        onClose={() => {
          setListSheetOpen(false)
          setEditingItem(null)
        }}
        ingredients={ingredients}
        editing={editingItem}
        onSave={(item) => void saveListItem(item)}
        onDelete={
          editingItem
            ? () => {
                void removeListItem(editingItem.id)
                setListSheetOpen(false)
                setEditingItem(null)
              }
            : undefined
        }
      />

      <RestockSheet
        open={restockOpen}
        onClose={closeRestockSheet}
        ingredients={ingredients}
        editing={editing}
        prefill={prefill}
        onSavedFromShoppingList={(listId, purchasedItemIds) =>
          void onRestockSavedFromList(listId, purchasedItemIds)
        }
      />
    </div>
  )
}

function lineUnitCost(line: RestockLine): number | undefined {
  if (line.amount <= 0 || line.cost <= 0) return undefined
  return Math.round((line.cost / line.amount) * 10000) / 10000
}

function emptyLine(ingredientId: number): RestockLine {
  return {
    ingredientId,
    brand: '',
    amount: 0,
    cost: 0,
  }
}

function ShoppingListItemSheet({
  open,
  onClose,
  ingredients,
  editing,
  onSave,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  ingredients: { id?: number; name: string; unit: string }[]
  editing: ShoppingListItem | null
  onSave: (item: Omit<ShoppingListItem, 'id'> & { id?: string }) => void
  onDelete?: () => void
}) {
  const [ingredientId, setIngredientId] = useState(0)
  const [amount, setAmount] = useState(0)
  const [brand, setBrand] = useState('')
  const [cost, setCost] = useState(0)
  const [store, setStore] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      setIngredientId(editing.ingredientId)
      setAmount(editing.amount)
      setBrand(editing.brand)
      setCost(editing.cost)
      setStore(editing.store)
      setNotes(editing.notes ?? '')
    } else {
      setIngredientId(ingredients[0]?.id ?? 0)
      setAmount(0)
      setBrand('')
      setCost(0)
      setStore('')
      setNotes('')
    }
  }, [open, editing, ingredients])

  const unit = ingredients.find((i) => i.id === ingredientId)?.unit ?? 'g'

  return (
    <Sheet open={open} title={editing ? 'Edit list item' : 'Add to shopping list'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Ingredient">
          <SelectField<number>
            title="Ingredient"
            value={ingredientId}
            onChange={setIngredientId}
            options={ingredients.map((i) => ({ id: i.id!, label: i.name }))}
          />
        </Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={`Amount (${unit})`}>
            <NumberField value={amount} min={0} step={1} onChange={setAmount} />
          </Field>
          <Field label="Price (Kč)">
            <NumberField value={cost} min={0} step={1} onChange={setCost} />
          </Field>
          <Field label="Brand">
            <input
              className={inputClass}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Store">
            <input
              className={inputClass}
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="e.g. Albert"
              list="shopping-store-suggestions"
            />
            <datalist id="shopping-store-suggestions">
              <option value="Albert" />
              <option value="Tesco" />
              <option value="Lidl" />
              <option value="Kaufland" />
              <option value="Asian market" />
              <option value="Japan Center" />
            </datalist>
          </Field>
        </div>
        <Field label="Notes">
          <input
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Button
          className="w-full"
          onClick={async () => {
            if (!ingredientId) {
              await appAlert('Pick an ingredient.')
              return
            }
            onSave({
              id: editing?.id,
              ingredientId,
              amount,
              brand,
              cost,
              store,
              notes,
            })
          }}
        >
          {editing ? 'Save item' : 'Add to list'}
        </Button>
        {onDelete ? (
          <RemoveButton className="w-full" label="Remove from list" onClick={onDelete} />
        ) : null}
      </div>
    </Sheet>
  )
}

function RestockSheet({
  open,
  onClose,
  ingredients,
  editing,
  prefill,
  onSavedFromShoppingList,
}: {
  open: boolean
  onClose: () => void
  ingredients: { id?: number; name: string; unit: string; rawFridgeDays?: number }[]
  editing: Restock | null
  prefill: RestockPrefill | null
  onSavedFromShoppingList?: (shoppingListId: number, purchasedItemIds: string[]) => void
}) {
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<RestockLine[]>([])
  const [originalLines, setOriginalLines] = useState<RestockLine[]>([])
  const [fromListId, setFromListId] = useState<number | undefined>()
  const [purchasedItemIds, setPurchasedItemIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setDate(editing.date)
      setNotes(editing.notes)
      setLines(editing.lines.map((l) => ({ ...l })))
      setOriginalLines(editing.lines.map((l) => ({ ...l })))
      setFromListId(undefined)
      setPurchasedItemIds([])
    } else if (prefill) {
      setDate(todayISO())
      setNotes(prefill.notes)
      setLines(prefill.lines.map((l) => ({ ...l })))
      setOriginalLines([])
      setFromListId(prefill.shoppingListId)
      setPurchasedItemIds(prefill.purchasedItemIds ?? [])
    } else {
      setDate(todayISO())
      setNotes('')
      setLines([])
      setOriginalLines([])
      setFromListId(undefined)
      setPurchasedItemIds([])
    }
  }, [open, editing, prefill])

  function addLine() {
    const first = ingredients[0]
    if (!first?.id) return
    setLines([...lines, emptyLine(first.id)])
  }

  async function save() {
    if (lines.length === 0) {
      await appAlert('Add at least one line.', { title: 'Cannot save' })
      return
    }
    const totalCost = lines.reduce((s, l) => s + l.cost, 0)
    const now = new Date().toISOString()

    if (editing?.id) {
      await db.transaction('rw', db.restocks, db.pantryItems, async () => {
        const nextLines: RestockLine[] = []
        const keptPantryIds = new Set(
          lines.map((l) => l.pantryItemId).filter((id): id is number => id != null),
        )

        for (const old of originalLines) {
          if (old.pantryItemId != null && !keptPantryIds.has(old.pantryItemId)) {
            continue
          }
        }

        for (const line of lines) {
          if (line.pantryItemId != null) {
            const prev = originalLines.find((o) => o.pantryItemId === line.pantryItemId)
            const item = await db.pantryItems.get(line.pantryItemId)
            if (item) {
              const delta = line.amount - (prev?.amount ?? line.amount)
              await db.pantryItems.update(line.pantryItemId, {
                ingredientId: line.ingredientId,
                brand: line.brand,
                amountLeft: Math.max(0, item.amountLeft + delta),
                expiryDate: line.expiryDate,
                imageDataUrl: line.imageDataUrl,
                nutritionOverride: line.nutritionOverride,
                unitCost: lineUnitCost(line) ?? item.unitCost,
                updatedAt: now,
              })
            }
            nextLines.push(line)
          } else {
            const pantryItemId = await db.pantryItems.add({
              ingredientId: line.ingredientId,
              brand: line.brand,
              amountLeft: line.amount,
              expiryDate: line.expiryDate,
              imageDataUrl: line.imageDataUrl,
              nutritionOverride: line.nutritionOverride,
              unitCost: lineUnitCost(line),
              createdAt: now,
              updatedAt: now,
            })
            nextLines.push({ ...line, pantryItemId })
          }
        }

        await db.restocks.update(editing.id!, {
          date,
          lines: nextLines,
          totalCost,
          notes,
        })
      })
    } else {
      await db.transaction('rw', db.restocks, db.pantryItems, async () => {
        const linkedLines: RestockLine[] = []
        for (const line of lines) {
          const pantryItemId = await db.pantryItems.add({
            ingredientId: line.ingredientId,
            brand: line.brand,
            amountLeft: line.amount,
            expiryDate: line.expiryDate,
            imageDataUrl: line.imageDataUrl,
            nutritionOverride: line.nutritionOverride,
            unitCost: lineUnitCost(line),
            createdAt: now,
            updatedAt: now,
          })
          linkedLines.push({ ...line, pantryItemId })
        }
        await db.restocks.add({
          date,
          lines: linkedLines,
          totalCost,
          notes,
          createdAt: now,
        })
      })
      if (fromListId != null) onSavedFromShoppingList?.(fromListId, purchasedItemIds)
    }

    onClose()
  }

  async function remove() {
    if (!editing?.id) return
    if (
      !(await appConfirm(
        'Delete this restock record? Pantry items created from it will not be removed.',
        { danger: true, confirmLabel: 'Delete' },
      ))
    ) {
      return
    }
    await db.restocks.delete(editing.id)
    onClose()
  }

  const title = editing
    ? 'Edit restock'
    : fromListId != null
      ? 'Restock from shopping list'
      : 'Restock'

  return (
    <Sheet open={open} title={title} onClose={onClose} wide>
      <div className="space-y-3">
        {fromListId != null ? (
          <WarnBanner>
            Prefilled from your shopping list. Adjust amounts, expiry, or photos, then save to update
            the pantry.
          </WarnBanner>
        ) : null}
        <Field label="Purchase date">
          <DateField title="Purchase date" value={date} onChange={setDate} />
        </Field>
        <div className="flex justify-between">
          <h3 className="font-medium">Items</h3>
          <Button variant="secondary" onClick={addLine}>
            Add line
          </Button>
        </div>
        {lines.map((line, idx) => {
          const lineIng = ingredients.find((i) => i.id === line.ingredientId)
          const unit = lineIng?.unit ?? 'g'
          return (
            <div key={idx} className="space-y-2 rounded-lg border border-line p-3">
              <Field label="Ingredient">
                <SelectField<number>
                  title="Ingredient"
                  value={line.ingredientId}
                  onChange={(ingredientId) => {
                    const next = [...lines]
                    const ing = ingredients.find((i) => i.id === ingredientId)
                    next[idx] = {
                      ...line,
                      ingredientId,
                      expiryDate:
                        line.expiryDate ||
                        suggestedExpiryFromIngredient(ing) ||
                        undefined,
                    }
                    setLines(next)
                  }}
                  options={ingredients.map((i) => ({ id: i.id!, label: i.name }))}
                />
              </Field>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Brand">
                  <input
                    className={inputClass}
                    value={line.brand}
                    onChange={(e) => {
                      const next = [...lines]
                      next[idx] = { ...line, brand: e.target.value }
                      setLines(next)
                    }}
                  />
                </Field>
                <Field label={`Amount (${unit})`}>
                  <NumberField
                    value={line.amount}
                    min={0}
                    step={1}
                    onChange={(amount) => {
                      const next = [...lines]
                      next[idx] = { ...line, amount }
                      setLines(next)
                    }}
                  />
                </Field>
                <Field label="Cost (Kč)">
                  <NumberField
                    value={line.cost}
                    min={0}
                    step={1}
                    onChange={(cost) => {
                      const next = [...lines]
                      next[idx] = { ...line, cost }
                      setLines(next)
                    }}
                  />
                </Field>
                <Field label="Expiry date">
                  <DateField
                    title="Expiry date"
                    value={line.expiryDate ?? ''}
                    allowEmpty
                    emptyLabel="No expiry"
                    onChange={(expiryDate) => {
                      const next = [...lines]
                      next[idx] = { ...line, expiryDate: expiryDate || undefined }
                      setLines(next)
                    }}
                  />
                </Field>
                <ImageUploadField
                  value={line.imageDataUrl}
                  onChange={(url) => {
                    const next = [...lines]
                    next[idx] = { ...line, imageDataUrl: url }
                    setLines(next)
                  }}
                />
              </div>
              <RemoveButton onClick={() => setLines(lines.filter((_, i) => i !== idx))} />
            </div>
          )
        })}
        <Field label="Notes">
          <AutoTextarea minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button className="w-full" onClick={() => void save()}>
          {editing ? 'Save changes' : 'Save restock'}
        </Button>
        {editing ? (
          <Button variant="danger" className="w-full" onClick={() => void remove()}>
            Delete restock
          </Button>
        ) : null}
      </div>
    </Sheet>
  )
}
