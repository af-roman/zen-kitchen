import Dexie, { type Table } from 'dexie'
import type {
  CookLogEntry,
  CookingSession,
  Goals,
  Ingredient,
  Meta,
  PantryItem,
  ReadyBatch,
  Recipe,
  Restock,
  Serving,
  ShoppingList,
  WasteEntry,
} from '@/domain/types'

export class ZenKitchenDB extends Dexie {
  goals!: Table<Goals, number>
  ingredients!: Table<Ingredient, number>
  pantryItems!: Table<PantryItem, number>
  recipes!: Table<Recipe, number>
  cookingSessions!: Table<CookingSession, number>
  readyBatches!: Table<ReadyBatch, number>
  servings!: Table<Serving, number>
  restocks!: Table<Restock, number>
  shoppingLists!: Table<ShoppingList, number>
  cookLog!: Table<CookLogEntry, number>
  waste!: Table<WasteEntry, number>
  meta!: Table<Meta, number>

  constructor() {
    super('zen-kitchen')
    this.version(1).stores({
      goals: 'id',
      ingredients: '++id, name, category',
      pantryItems: '++id, ingredientId, expiryDate, amountLeft',
      recipes: '++id, name, category, effort, createdAt',
      cookingSessions: '++id, date, status',
      readyBatches: '++id, recipeId, cookedAt, expiresAt',
      servings: '++id, date, meal, sessionId',
      restocks: '++id, date',
      cookLog: '++id, sessionId, date',
      waste: '++id, date, recipeId',
      meta: 'id',
    })
    this.version(2).stores({
      goals: 'id',
      ingredients: '++id, name, category',
      pantryItems: '++id, ingredientId, expiryDate, amountLeft',
      recipes: '++id, name, category, effort, createdAt',
      cookingSessions: '++id, date, status',
      readyBatches: '++id, recipeId, cookedAt, expiresAt',
      servings: '++id, date, meal, sessionId',
      restocks: '++id, date',
      shoppingLists: '++id, status, updatedAt',
      cookLog: '++id, sessionId, date',
      waste: '++id, date, recipeId',
      meta: 'id',
    })
  }
}

export const db = new ZenKitchenDB()
