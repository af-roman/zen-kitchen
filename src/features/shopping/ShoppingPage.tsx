import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { db } from '@/db/database'
import type { Restock, RestockLine, ShoppingListItem } from '@/domain/types'
import { isLowStock, todayISO, uid } from '@/domain/kitchen'
import { stockTotals } from '@/domain/recipeMath'
import { ImageUploadField } from '@/shared/ImageUploadField'
import { Badge, Button, EmptyState, Field, PageHeader, WarnBanner, inputClass } from '@/shared/ui'
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
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const restocks = useLiveQuery(() => db.restocks.orderBy('date').reverse().toArray(), []) ?? []
  const openLists =
    useLiveQuery(() => db.shoppingLists.where('status').equals('open').toArray(), []) ?? []
  const shoppingList = openLists[0] ?? null

  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const stock = useMemo(() => stockTotals(pantry), [pantry])

  const lowItems = useMemo(() => {
    return ingredients.filter((ing) => {
      const have = stock.get(ing.id!) ?? 0
      return have === 0 || isLowStock(have, ing.lowStockThreshold)
    })
  }, [ingredients, stock])

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const spendWeek = restocks
    .filter((r) => {
      const d = parseISO(r.date)
      return d >= weekStart && d <= weekEnd
    })
    .reduce((s, r) => s + r.totalCost, 0)
  const spendMonth = restocks
    .filter((r) => {
      const d = parseISO(r.date)
      return d >= monthStart && d <= monthEnd
    })
    .reduce((s, r) => s + r.totalCost, 0)

  const [restockOpen, setRestockOpen] = useState(false)
  const [editing, setEditing] = useState<Restock | null>(null)
  const [prefill, setPrefill] = useState<RestockPrefill | null>(null)
  const [listSheetOpen, setListSheetOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const listItems = shoppingList?.items ?? []
  const listItemIds = useMemo(() => new Set(listItems.map((i) => i.id)), [listItems])

  // Drop selections for items that are no longer on the list.
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => listItemIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [listItemIds])

  const selectedItems = useMemo(
    () => listItems.filter((i) => selectedIds.has(i.id)),
    [listItems, selectedIds],
  )
  const allSelected = listItems.length > 0 && selectedItems.length === listItems.length

  const listTotal = listItems.reduce((s, i) => s + (Number(i.cost) || 0), 0)
  const selectedTotal = selectedItems.reduce((s, i) => s + (Number(i.cost) || 0), 0)
  const stores = useMemo(() => {
    const set = new Set(
      listItems.map((i) => i.store.trim()).filter((s) => s.length > 0),
    )
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [listItems])
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
    const nextItem: ShoppingListItem = {
      id: item.id ?? uid(),
      ingredientId: item.ingredientId,
      amount: item.amount,
      brand: item.brand.trim(),
      cost: item.cost,
      store: item.store.trim(),
      notes: item.notes?.trim() || undefined,
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

  async function clearList() {
    if (!shoppingList?.id || listItems.length === 0) return
    if (!confirm('Clear the shopping list?')) return
    await db.shoppingLists.update(shoppingList.id, {
      items: [],
      updatedAt: new Date().toISOString(),
    })
    setSelectedIds(new Set())
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
      alert('Add items to the shopping list first.')
      return
    }
    if (selectedItems.length === 0) {
      alert('Select the items you purchased first.')
      return
    }
    const storeNote =
      selectedStores.length > 0 ? `Stores: ${selectedStores.join(', ')}` : ''
    const lines: RestockLine[] = selectedItems.map((i) => ({
      ingredientId: i.ingredientId,
      brand: i.brand,
      amount: i.amount,
      cost: i.cost,
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

  async function addLowToList(ingredientId: number) {
    const listId = await ensureOpenList()
    const list = (await db.shoppingLists.get(listId))!
    if (list.items.some((i) => i.ingredientId === ingredientId)) {
      alert('Already on the shopping list.')
      return
    }
    const next: ShoppingListItem = {
      id: uid(),
      ingredientId,
      amount: 0,
      brand: '',
      cost: 0,
      store: '',
    }
    await db.shoppingLists.update(listId, {
      items: [...list.items, next],
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div>
      <PageHeader
        title="Shopping"
        subtitle="Plan a list, restock the pantry, and keep an eye on spend."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={startAddListItem}>
              Add to list
            </Button>
            <Button onClick={startCreateRestock}>Restock</Button>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <p className="text-xs text-ink-muted">This week</p>
          <p className="font-display text-2xl text-accent-deep">{spendWeek.toFixed(0)} Kč</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <p className="text-xs text-ink-muted">This month</p>
          <p className="font-display text-2xl text-accent-deep">{spendMonth.toFixed(0)} Kč</p>
        </div>
      </div>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">Shopping list</h2>
          <div className="flex flex-wrap gap-2">
            {listItems.length > 0 ? (
              <>
                <Button variant="ghost" className="!py-1 !text-xs" onClick={toggleSelectAll}>
                  {allSelected ? 'Deselect all' : 'Select all'}
                </Button>
                <Button variant="ghost" className="!py-1 !text-xs" onClick={() => void clearList()}>
                  Clear
                </Button>
                <Button
                  className="!py-1 !text-xs"
                  disabled={selectedItems.length === 0}
                  onClick={() => void markPurchased()}
                >
                  Mark purchased
                  {selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
                </Button>
              </>
            ) : null}
            <Button variant="secondary" className="!py-1 !text-xs" onClick={startAddListItem}>
              Add item
            </Button>
          </div>
        </div>

        {listItems.length === 0 ? (
          <EmptyState
            title="List is empty"
            body="Add pantry ingredients you plan to buy — amount, brand, price, and store."
          />
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-paper-elevated px-3 py-2">
                <p className="text-xs text-ink-muted">
                  {selectedItems.length > 0 ? 'Selected total' : 'Estimated total'}
                </p>
                <p className="font-display text-xl text-accent-deep">
                  {(selectedItems.length > 0 ? selectedTotal : listTotal).toFixed(0)} Kč
                </p>
                {selectedItems.length > 0 && selectedItems.length < listItems.length ? (
                  <p className="text-xs text-ink-muted">of {listTotal.toFixed(0)} Kč on list</p>
                ) : null}
              </div>
              <div className="rounded-lg border border-line bg-paper-elevated px-3 py-2">
                <p className="text-xs text-ink-muted">
                  {selectedItems.length > 0 ? 'Selected stores' : 'Stores to visit'}
                </p>
                <p className="text-sm font-medium">
                  {(selectedItems.length > 0 ? selectedStores : stores).length > 0
                    ? (selectedItems.length > 0 ? selectedStores : stores).join(', ')
                    : 'Not set yet'}
                </p>
              </div>
            </div>
            {selectedItems.length === 0 ? (
              <p className="mb-3 text-xs text-ink-muted">
                Select items you’ve bought, then mark them purchased to restock.
              </p>
            ) : null}
            {stores.length > 1 ? (
              <div className="mb-3 space-y-2">
                {stores.map((store) => {
                  const storeItems = listItems.filter((i) => i.store.trim() === store)
                  const storeTotal = storeItems.reduce((s, i) => s + (Number(i.cost) || 0), 0)
                  return (
                    <div
                      key={store}
                      className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-sm"
                    >
                      <div className="flex justify-between gap-2 font-medium">
                        <span>{store}</span>
                        <span>{storeTotal.toFixed(0)} Kč</span>
                      </div>
                      <p className="text-xs text-ink-muted">
                        {storeItems.length} item{storeItems.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : null}
            <ul className="space-y-2">
              {listItems.map((item) => {
                const ing = ingById.get(item.ingredientId)
                const checked = selectedIds.has(item.id)
                return (
                  <li
                    key={item.id}
                    className={`flex items-stretch gap-2 rounded-[var(--radius-card)] border bg-paper-elevated transition ${
                      checked ? 'border-accent/50 bg-accent/5' : 'border-line'
                    }`}
                  >
                    <label className="flex cursor-pointer items-center px-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-accent)]"
                        checked={checked}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${ing?.name ?? 'item'}`}
                      />
                    </label>
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
                        {item.store ? (
                          <>
                            <span>·</span>
                            <Badge tone="accent">{item.store}</Badge>
                          </>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg">Running low</h2>
        {lowItems.length === 0 ? (
          <p className="text-sm text-ink-muted">Pantry looks steady.</p>
        ) : (
          <>
            <WarnBanner>These ingredients are at or below their low-stock threshold.</WarnBanner>
            <ul className="mt-3 space-y-2">
              {lowItems.map((ing) => {
                const onList = listItems.some((i) => i.ingredientId === ing.id)
                return (
                  <li
                    key={ing.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      {ing.name}{' '}
                      <Badge tone="warn">
                        {stock.get(ing.id!) ?? 0} {ing.unit}
                      </Badge>
                    </span>
                    <Button
                      variant="ghost"
                      className="!py-1 !text-xs shrink-0"
                      disabled={onList}
                      onClick={() => void addLowToList(ing.id!)}
                    >
                      {onList ? 'On list' : 'Add to list'}
                    </Button>
                  </li>
                )
              })}
            </ul>
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
                  className="w-full rounded-[var(--radius-card)] border border-line bg-paper-elevated px-3 py-3 text-left transition hover:border-accent/40"
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
          <select
            className={inputClass}
            value={ingredientId}
            onChange={(e) => setIngredientId(Number(e.target.value))}
          >
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Amount (${unit})`}>
            <input
              className={inputClass}
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="Price (Kč)">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
            />
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
          onClick={() => {
            if (!ingredientId) {
              alert('Pick an ingredient.')
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
          <Button variant="danger" className="w-full" onClick={onDelete}>
            Remove from list
          </Button>
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
  ingredients: { id?: number; name: string; unit: string }[]
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
      alert('Add at least one line.')
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
      !confirm(
        'Delete this restock record? Pantry items created from it will not be removed.',
      )
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
          <input
            className={inputClass}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
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
                <select
                  className={inputClass}
                  value={line.ingredientId}
                  onChange={(e) => {
                    const next = [...lines]
                    next[idx] = { ...line, ingredientId: Number(e.target.value) }
                    setLines(next)
                  }}
                >
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
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
                  <input
                    className={inputClass}
                    type="number"
                    value={line.amount}
                    onChange={(e) => {
                      const next = [...lines]
                      next[idx] = { ...line, amount: Number(e.target.value) }
                      setLines(next)
                    }}
                  />
                </Field>
                <Field label="Cost (Kč)">
                  <input
                    className={inputClass}
                    type="number"
                    value={line.cost}
                    onChange={(e) => {
                      const next = [...lines]
                      next[idx] = { ...line, cost: Number(e.target.value) }
                      setLines(next)
                    }}
                  />
                </Field>
                <Field label="Expiry date">
                  <input
                    className={inputClass}
                    type="date"
                    value={line.expiryDate ?? ''}
                    onChange={(e) => {
                      const next = [...lines]
                      next[idx] = { ...line, expiryDate: e.target.value || undefined }
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
              <Button variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>
                Remove
              </Button>
            </div>
          )
        })}
        <Field label="Notes">
          <textarea
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
