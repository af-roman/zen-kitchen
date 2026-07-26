/**
 * Convert justonecookbook_scrape/*.json into seed data + download recipe images.
 * Run: node scripts/import-joc.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'
import http from 'node:http'
import { extractStorageFromSteps } from './storage-parse.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const scrapeDir = path.join(root, 'justonecookbook_scrape')
const outJson = path.join(root, 'src/db/seed-joc.json')
const imageDir = path.join(root, 'public/recipes/joc')

const UNICODE_FRAC = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
}

const EXISTING_ALIASES = {
  'short-grain rice': 'Short-grain rice',
  'japanese short-grain rice': 'Short-grain rice',
  'rice': 'Short-grain rice',
  'soba noodles': 'Soba noodles',
  'soba': 'Soba noodles',
  'chicken breast': 'Chicken breast',
  'chicken thighs': 'Chicken thighs',
  'boneless skin-on chicken thighs': 'Chicken thighs',
  'salmon fillet': 'Salmon fillet',
  'salmon': 'Salmon fillet',
  'firm tofu': 'Firm tofu',
  tofu: 'Firm tofu',
  eggs: 'Eggs',
  egg: 'Eggs',
  carrot: 'Carrot',
  carrots: 'Carrot',
  'spring onion': 'Spring onion',
  'green onion': 'Spring onion',
  'green onions': 'Spring onion',
  scallion: 'Spring onion',
  scallions: 'Spring onion',
  'shiitake mushrooms': 'Shiitake mushrooms',
  shiitake: 'Shiitake mushrooms',
  spinach: 'Spinach',
  'daikon radish': 'Daikon radish',
  daikon: 'Daikon radish',
  edamame: 'Edamame',
  'nori sheets': 'Nori sheets',
  nori: 'Nori sheets',
  kombu: 'Kombu',
  katsuobushi: 'Katsuobushi',
  'bonito flakes': 'Katsuobushi',
  'white miso': 'White miso',
  miso: 'White miso',
  'soy sauce': 'Soy sauce',
  mirin: 'Mirin',
  sake: 'Sake',
  salt: 'Salt',
  'kosher salt': 'Salt',
  'diamond crystal kosher salt': 'Salt',
  'sea salt': 'Salt',
  'rice vinegar': 'Rice vinegar',
  'sesame oil': 'Sesame oil',
  'toasted sesame oil': 'Sesame oil',
  'neutral oil': 'Neutral oil',
  'vegetable oil': 'Neutral oil',
  'canola oil': 'Neutral oil',
  'toasted sesame seeds': 'Toasted sesame seeds',
  'sesame seeds': 'Toasted sesame seeds',
  ginger: 'Ginger',
  garlic: 'Garlic',
  sugar: 'Sugar',
  'granulated sugar': 'Sugar',
  cucumber: 'Cucumber',
  wakame: 'Wakame (dried)',
  'dried wakame': 'Wakame (dried)',
  'all-purpose miso sauce': 'All-purpose miso sauce',
}

const NUTRITION_BY_CATEGORY = {
  staples: { energyKcal: 350, fatG: 2, carbsG: 70, proteinG: 8 },
  proteins: { energyKcal: 150, fatG: 8, carbsG: 1, proteinG: 20 },
  vegetables: { energyKcal: 30, fatG: 0.2, carbsG: 6, proteinG: 1.5 },
  fruit: { energyKcal: 60, fatG: 0.2, carbsG: 15, proteinG: 0.5 },
  seaweed: { energyKcal: 40, fatG: 0.5, carbsG: 8, proteinG: 3 },
  ferments: { energyKcal: 80, fatG: 1, carbsG: 10, proteinG: 5 },
  oils: { energyKcal: 884, fatG: 100, carbsG: 0, proteinG: 0 },
  pickles: { energyKcal: 20, fatG: 0.1, carbsG: 4, proteinG: 0.5 },
  spices: { energyKcal: 50, fatG: 1, carbsG: 8, proteinG: 2 },
  sweeteners: { energyKcal: 380, fatG: 0, carbsG: 95, proteinG: 0 },
  snacks: { energyKcal: 200, fatG: 10, carbsG: 25, proteinG: 5 },
}

function parseNumberToken(token) {
  token = token.trim()
  if (!token) return null
  if (UNICODE_FRAC[token] != null) return UNICODE_FRAC[token]
  if (/^\d+\/\d+$/.test(token)) {
    const [a, b] = token.split('/').map(Number)
    return b ? a / b : null
  }
  // mixed unicode: 1½ or 1 ½
  const mixedUni = token.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])$/)
  if (mixedUni) return Number(mixedUni[1]) + UNICODE_FRAC[mixedUni[2]]
  // mixed ascii: 1 1/2
  const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const n = Number(token.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseLeadingAmount(str) {
  const s = str.trim()
  // Range like 2–3 or 1.4-1.5 → take first number
  const range = s.match(
    /^([0-9¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚.]+(?:\s+[0-9]+\/[0-9]+)?)\s*[–—-]\s*[0-9¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚.\/\s]+(.*)$/u,
  )
  const work = range ? `${range[1].trim()} ${range[2].trim()}` : s

  const m = work.match(
    /^(\d+\s*[\u00bc\u00bd\u00be\u2153\u2154\u215b\u215c\u215d\u215e\u2155\u2156\u2157\u2158\u2159\u215a]|\d+\s+\d+\/\d+|\d+\.\d+|\.\d+|[\u00bc\u00bd\u00be\u2153\u2154\u215b\u215c\u215d\u215e\u2155\u2156\u2157\u2158\u2159\u215a]+|\d+\/\d+|\d+)\s*(.*)$/u,
  )
  if (!m) return null
  const amount = parseNumberToken(m[1].replace(/^\./, '0.'))
  if (amount == null || amount <= 0) return null
  return { amount, rest: m[2].trim() }
}

function classifyCategory(name) {
  const n = name.toLowerCase()
  if (/\blettuce\b|\bcabbage\b|\bspinach\b/.test(n)) return 'vegetables'
  if (/\bbuttermilk\b|\bmilk\b|\bcream\b/.test(n)) return 'staples'
  if (/(oil|lard|shortening|mayo)/.test(n) || /\bbutter\b/.test(n)) return 'oils'
  if (/(soy sauce|miso|mirin|sake|vinegar|dashi|ponzu|gochujang|doenjang)/.test(n))
    return 'ferments'
  if (/(sugar|honey|maple|mirin|maltose|sweetener)/.test(n) && !/soy/.test(n))
    return 'sweeteners'
  if (/(salt|pepper|spice|sesame seed|furikake|shichimi|curry|cumin|paprika|vanilla|baking)/.test(n))
    return 'spices'
  if (/(nori|kombu|wakame|katsuobushi|seaweed|hijiki)/.test(n)) return 'seaweed'
  if (/(chicken|pork|beef|salmon|tuna|tofu|egg|shrimp|fish|bacon|ham|sausage)/.test(n))
    return 'proteins'
  if (/(rice|flour|noodle|pasta|bread|oat|wheat|panko|cornstarch|potato starch)/.test(n))
    return 'staples'
  if (/(apple|banana|lemon|orange|berry|fruit|yuzu)/.test(n)) return 'fruit'
  if (/(pickle|kimchi|tsukemono)/.test(n)) return 'pickles'
  if (/(chip|snack|cracker)/.test(n)) return 'snacks'
  return 'vegetables'
}

const ML_PER_TSP = 5
const ML_PER_TBSP = 15

/** Known densities (g per ml) for solids often measured by spoon. */
const DENSITY_BY_NAME = {
  salt: 1.2,
  'kosher salt': 1.2,
  sugar: 0.85,
  'brown sugar': 0.85,
  'granulated sugar': 0.85,
  'unsalted butter': 0.96,
  'salted butter': 0.96,
  butter: 0.96,
  'white miso': 1.2,
  miso: 1.2,
  'toasted sesame seeds': 0.6,
  'sesame seeds': 0.6,
  'toasted white sesame seeds': 0.6,
  'white sesame seeds': 0.6,
  'black sesame seeds': 0.6,
  ginger: 0.9,
  garlic: 0.6,
  flour: 0.55,
  'all-purpose flour': 0.55,
  'bread flour': 0.55,
  'cake flour': 0.5,
  'potato starch': 0.6,
  cornstarch: 0.55,
  'corn starch': 0.55,
  'baking powder': 0.9,
  'baking soda': 0.9,
  matcha: 0.4,
  'instant yeast': 0.7,
  yeast: 0.7,
  honey: 1.4,
  'skim milk powder': 0.55,
  'nonfat dry milk powder': 0.55,
  mayonnaise: 0.95,
  'japanese kewpie mayonnaise': 0.95,
  ketchup: 1.15,
  gochujang: 1.2,
  doubanjiang: 1.2,
  'potato starch or cornstarch': 0.55,
  furikake: 0.4,
  'shichimi togarashi': 0.35,
  paprika: 0.45,
  cinnamon: 0.45,
  'white pepper powder': 0.45,
  'black pepper': 0.45,
}

function densityForName(name) {
  const n = name.toLowerCase()
  if (DENSITY_BY_NAME[n] != null) return DENSITY_BY_NAME[n]
  const keys = Object.keys(DENSITY_BY_NAME).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (n === key) return DENSITY_BY_NAME[key]
    // whole-word / token match — avoid "salt" matching "salted butter"
    const re = new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)
    if (re.test(n)) return DENSITY_BY_NAME[key]
  }
  return 0.9
}

function isLiquidName(name) {
  const n = name.toLowerCase()
  return /(oil|sauce|vinegar|mirin|sake|water|milk|juice|syrup|extract|dashi|broth|stock|cream|wine|honey|ketchup|mayonnaise|mayo|mentsuyu|ponzu|buttermilk)/.test(
    n,
  )
}

function normalizeSpoonUnit(unitRaw) {
  const u = (unitRaw || '').toLowerCase().replace(/\.$/, '')
  if (['tsp', 'tsps', 'teaspoon', 'teaspoons'].includes(u)) return 'tsp'
  if (['tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tbs', 'tb'].includes(u)) return 'tbsp'
  return null
}

/**
 * Parse a scraped amount into stock amount + optional spoon measureUnit.
 * amount is always in stock unit (g / ml / pcs) for RecipeIngredientLine.
 */
function guessUnitAndStock(amount, unitRaw, name) {
  const u = (unitRaw || '').toLowerCase().replace(/\.$/, '')
  const n = name.toLowerCase()
  const spoon = normalizeSpoonUnit(unitRaw)

  if (spoon) {
    const ml = amount * (spoon === 'tsp' ? ML_PER_TSP : ML_PER_TBSP)
    if (isLiquidName(name)) {
      return {
        amount: Math.round(ml * 10) / 10,
        unit: 'ml',
        measureUnit: spoon,
        measureAmount: amount,
      }
    }
    const density = densityForName(name)
    return {
      amount: Math.round(ml * density * 10) / 10,
      unit: 'g',
      measureUnit: spoon,
      measureAmount: amount,
      gramsPerMl: density,
    }
  }

  if (['g', 'gram', 'grams'].includes(u)) return { amount, unit: 'g' }
  if (['kg', 'kilogram', 'kilograms'].includes(u)) return { amount: amount * 1000, unit: 'g' }
  if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(u))
    return { amount, unit: 'ml' }
  if (['l', 'liter', 'liters', 'litre', 'litres'].includes(u))
    return { amount: amount * 1000, unit: 'ml' }
  if (['cup', 'cups'].includes(u)) {
    if (/(flour|starch|panko|breadcrumb)/.test(n)) return { amount: amount * 120, unit: 'g' }
    if (/(sugar|brown sugar)/.test(n)) return { amount: amount * 200, unit: 'g' }
    if (/(rice)/.test(n)) return { amount: amount * 180, unit: 'g' }
    if (/(butter)/.test(n)) return { amount: amount * 227, unit: 'g' }
    if (isLiquidName(name)) return { amount: amount * 240, unit: 'ml' }
    return { amount: amount * 150, unit: 'g' }
  }
  if (['oz', 'ounce', 'ounces'].includes(u)) return { amount: amount * 28, unit: 'g' }
  if (['lb', 'lbs', 'pound', 'pounds'].includes(u)) return { amount: amount * 454, unit: 'g' }
  if (
    [
      'pc',
      'pcs',
      'piece',
      'pieces',
      'large',
      'medium',
      'small',
      'clove',
      'cloves',
      'sheet',
      'sheets',
      'stalk',
      'stalks',
      'sprig',
      'sprigs',
      'bunch',
      'bunches',
      'can',
      'cans',
      'package',
      'packages',
      'pack',
      'slice',
      'slices',
      'leaf',
      'leaves',
      'ear',
      'ears',
      'fillet',
      'fillets',
      'head',
      'heads',
      'packet',
      'packets',
      'pinch',
      'pinches',
    ].includes(u)
  ) {
    return { amount, unit: 'pcs' }
  }
  // bare number before egg/banana etc.
  if (!u && /(egg|banana|onion|carrot|potato|apple|lemon|lime|avocado|tomato)/.test(n)) {
    return { amount, unit: 'pcs' }
  }
  if (!u) return { amount, unit: 'g' }
  return { amount, unit: 'g' }
}

function cleanIngredientName(raw) {
  let name = raw
    .replace(/\s+/g, ' ')
    .replace(/^of\s+/i, '')
    .trim()
  // Drop trailing parenthetical notes for matching, keep a short name
  name = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  // Cut at semicolon / — notes / "or use"
  name = name.split(/[;—]|,\s*or\b|\bor use\b/i)[0].trim()
  // Remove leading "and "
  name = name.replace(/^and\s+/i, '')
  // Strip leftover measure words if amount parse missed them
  name = name
    .replace(
      /^(cups?|tbsp|tbsps?|tablespoons?|tsp|tsps?|teaspoons?|g|grams?|kg|ml|oz|lb|lbs)\s+/i,
      '',
    )
    .trim()
  if (!name) name = raw.trim().slice(0, 60)
  // Compound “A, B, and C” lines — keep the lead item
  if (/,/.test(name)) name = name.split(',')[0].trim()
  // Drop leftover unicode measures stuck in the name
  name = name.replace(/[¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚\d]+\s*(cups?|tbsp|tsp|g|ml|oz|lb)s?\b/gi, '').trim()
  if (name.length > 60) name = name.slice(0, 57).trim() + '…'
  return name.replace(/\s+/g, ' ').trim()
}

function titleCase(name) {
  return name
    .split(' ')
    .map((w) => {
      if (!w) return w
      if (w === w.toUpperCase() && w.length <= 4) return w
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

function resolveCanonicalName(cleaned) {
  const key = cleaned.toLowerCase()
  if (EXISTING_ALIASES[key]) return EXISTING_ALIASES[key]
  // partial alias: ends with known
  for (const [alias, canon] of Object.entries(EXISTING_ALIASES)) {
    if (key === alias || key.endsWith(` ${alias}`) || key.startsWith(`${alias} `)) {
      return canon
    }
  }
  return titleCase(cleaned)
}

function parseIngredientLine(line) {
  const cleanedLine = line.replace(/\s+/g, ' ').trim()
  const leading = parseLeadingAmount(cleanedLine)
  if (!leading) {
    const name = resolveCanonicalName(cleanIngredientName(cleanedLine))
    return {
      name,
      amount: 1,
      unit: 'pcs',
      measureUnit: undefined,
      measureAmount: undefined,
      gramsPerMl: undefined,
      raw: cleanedLine,
    }
  }
  let rest = leading.rest
  const unitMatch = rest.match(
    /^(cups?|tbsp|tbsps?|tablespoons?|tsp|tsps?|teaspoons?|g|grams?|kg|ml|l|liters?|litres?|oz|ounces?|lb|lbs|pounds?|pcs?|pieces?|large|medium|small|cloves?|sheets?|stalks?|sprigs?|bunches?|cans?|packages?|packs?|slices?|leaves?|ears?|fillets?|heads?|packets?|pinches?)\b\.?\s*(.*)$/i,
  )
  let unitRaw = ''
  if (unitMatch) {
    unitRaw = unitMatch[1]
    rest = unitMatch[2]
  }
  const name = resolveCanonicalName(cleanIngredientName(rest || cleanedLine))
  const stock = guessUnitAndStock(leading.amount, unitRaw, name)
  return {
    name,
    amount: Math.round(stock.amount * 10) / 10,
    unit: stock.unit,
    measureUnit: stock.measureUnit,
    measureAmount: stock.measureAmount,
    gramsPerMl: stock.gramsPerMl,
    raw: cleanedLine,
  }
}

function seedIngredientRow(parsed) {
  const row = { name: parsed.name, amount: parsed.amount }
  if (parsed.measureUnit) row.measureUnit = parsed.measureUnit
  return row
}

function mergeIngredientRows(prev, next) {
  // Prefer keeping spoon display when both lines use the same spoon unit
  if (
    prev.measureUnit &&
    next.measureUnit &&
    prev.measureUnit === next.measureUnit &&
    prev.measureAmount != null &&
    next.measureAmount != null
  ) {
    const measureAmount = prev.measureAmount + next.measureAmount
    const rebuilt = guessUnitAndStock(measureAmount, prev.measureUnit, prev.name)
    prev.amount = Math.round(rebuilt.amount * 10) / 10
    prev.measureAmount = measureAmount
    prev.measureUnit = prev.measureUnit
    return
  }
  prev.amount = Math.round((prev.amount + next.amount) * 10) / 10
  prev.measureUnit = undefined
  prev.measureAmount = undefined
}

function upsertIngredientMeta(ingredientMeta, coreByName, parsed) {
  const keyName = parsed.name.toLowerCase()
  const core = coreByName.get(keyName)
  if (core) {
    // Ensure density on solids used with spoons (core may already have it)
    if (parsed.gramsPerMl != null && core.gramsPerMl == null) {
      core.needsGramsPerMl = parsed.gramsPerMl
    }
    return
  }

  const existing = ingredientMeta.get(keyName)
  if (!existing) {
    const meta = {
      name: parsed.name,
      unit: parsed.unit,
      category: classifyCategory(parsed.name),
    }
    if (parsed.gramsPerMl != null) meta.gramsPerMl = parsed.gramsPerMl
    else if (parsed.unit === 'g' && parsed.measureUnit) {
      meta.gramsPerMl = densityForName(parsed.name)
    }
    ingredientMeta.set(keyName, meta)
    return
  }

  if (existing.unit === 'pcs' && parsed.unit !== 'pcs') existing.unit = parsed.unit
  if (parsed.gramsPerMl != null && existing.gramsPerMl == null) {
    existing.gramsPerMl = parsed.gramsPerMl
  }
  if (existing.unit === 'g' && parsed.measureUnit && existing.gramsPerMl == null) {
    existing.gramsPerMl = densityForName(parsed.name)
  }
}

function cleanRecipeTitle(title) {
  return title
    .replace(/\s*\(Video\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugFromUrl(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.replace(/\/$/, '').split('/')
    return parts[parts.length - 1] || 'recipe'
  } catch {
    return 'recipe'
  }
}

function extractTips(recipe) {
  const tips = []
  for (const group of recipe.chefTips || []) {
    for (const item of group.items || []) {
      const t = String(item).trim()
      if (t) tips.push(t.slice(0, 400))
    }
  }
  // Pull Nami's Tip lines from instructions
  for (const group of recipe.instructions || []) {
    for (const item of group.items || []) {
      const text = String(item)
      const re = /Nami'?s Tip:\s*([^]+?)(?=Nami'?s Tip:|$)/gi
      let m
      while ((m = re.exec(text))) {
        const tip = m[1].trim()
        if (tip && tips.length < 8) tips.push(tip.slice(0, 400))
      }
    }
  }
  if (tips.length === 0) {
    tips.push('See the source recipe for timing notes, substitutions, and storage tips.')
  }
  return tips.slice(0, 8)
}

function mapCategory(fileKey, title) {
  if (fileKey === 'soups') return 'soup'
  const t = title.toLowerCase()
  if (/ramen|udon|soba|donburi|bowl|curry/.test(t)) return 'bowl'
  if (/rice|onigiri|porridge|okayu|takikomi/.test(t)) return 'rice'
  if (/grill|yaki|shiozake|broil|toast/.test(t)) return 'grilled'
  if (/stir|itame|chanpuru/.test(t)) return 'stirfry'
  if (/nimono|braise|simmer|nikujaga/.test(t)) return 'simmered'
  if (/pickle|tsukemono|salad|side/.test(t)) return 'sides'
  if (fileKey === 'breakfasts') return 'other'
  return 'other'
}

function mapEffort(stepCount) {
  if (stepCount <= 6) return 'easy'
  if (stepCount <= 14) return 'medium'
  return 'advanced'
}

function mapStorage(fileKey, title) {
  const t = title.toLowerCase()
  if (/bread|shokupan|toast|cake|cookie|muffin/.test(t)) {
    return { storageDays: 3, storageEnv: 'room' }
  }
  if (fileKey === 'soups') return { storageDays: 3, storageEnv: 'fridge' }
  return { storageDays: 3, storageEnv: 'fridge' }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      resolve('skip')
      return
    }
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ZenKitchenSeed/1.0)',
          Accept: 'image/*',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location, dest).then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          res.resume()
          return
        }
        const tmp = `${dest}.part`
        const file = fs.createWriteStream(tmp)
        res.pipe(file)
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tmp, dest)
            resolve('ok')
          })
        })
        file.on('error', (err) => {
          try {
            fs.unlinkSync(tmp)
          } catch {
            /* ignore */
          }
          reject(err)
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(30000, () => {
      req.destroy(new Error('timeout'))
    })
  })
}

async function mapPool(items, concurrency, fn) {
  const results = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

function loadCoreIngredients() {
  const seedPath = path.join(root, 'src/db/seed-data.ts')
  const src = fs.readFileSync(seedPath, 'utf8')
  const section = src.split('export const SEED_INGREDIENTS')[1].split('function step')[0]
  const blocks = section.split(/\{\s*name:/).slice(1)
  const byName = new Map()
  for (const block of blocks) {
    const name = block.match(/^\s*'([^']+)'/)?.[1]
    if (!name) continue
    const unit = block.match(/unit:\s*'([^']+)'/)?.[1] ?? 'g'
    const gramsPerMlRaw = block.match(/gramsPerMl:\s*([0-9.]+)/)?.[1]
    byName.set(name.toLowerCase(), {
      name,
      unit,
      gramsPerMl: gramsPerMlRaw != null ? Number(gramsPerMlRaw) : undefined,
    })
  }
  return byName
}

async function main() {
  fs.mkdirSync(imageDir, { recursive: true })
  const coreByName = loadCoreIngredients()

  const files = [
    { key: 'breakfasts', file: 'breakfasts.json' },
    { key: 'lunches', file: 'lunches.json' },
    { key: 'soups', file: 'soups.json' },
  ]

  const ingredientMeta = new Map() // nameLower -> { name, unit, category, gramsPerMl? }
  const recipes = []
  const usedTitles = new Set()
  const downloads = []

  for (const { key, file } of files) {
    const data = JSON.parse(fs.readFileSync(path.join(scrapeDir, file), 'utf8'))
    for (const raw of data) {
      let title = cleanRecipeTitle(raw.title)
      const slug = slugFromUrl(raw.url)
      if (usedTitles.has(title.toLowerCase())) {
        title = `${title} (${slug})`
      }
      usedTitles.add(title.toLowerCase())

      const imageSlug = slug.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
      const imageExt = path.extname(new URL(raw.imageUrl).pathname) || '.jpg'
      const imageFile = `${imageSlug}${imageExt.startsWith('.') ? imageExt : `.${imageExt}`}`
      const imagePath = path.join(imageDir, imageFile)
      downloads.push({ url: raw.imageUrl, dest: imagePath })

      const tips = extractTips(raw)
      const steps = []
      for (const group of raw.instructions || []) {
        const groupName =
          !group.group || group.group === 'main' ? undefined : String(group.group).slice(0, 80)
        for (const item of group.items || []) {
          let description = String(item).trim()
          // Soften tip inline duplication — keep step text
          if (!description) continue
          if (description.length > 500) description = `${description.slice(0, 497)}…`
          steps.push({
            description,
            requiresTimer: false,
            group: groupName,
          })
        }
      }
      if (steps.length === 0) {
        steps.push({
          description: 'Follow the original recipe steps at the source URL.',
          requiresTimer: false,
        })
      }

      const ingredientNames = []
      const seenIng = new Map()
      for (const group of raw.ingredients || []) {
        for (const item of group.items || []) {
          const parsed = parseIngredientLine(String(item))
          if (!parsed.name) continue
          const keyName = parsed.name.toLowerCase()

          // Prefer core stock unit when known (e.g. soy sauce is ml)
          const core = coreByName.get(keyName)
          if (core && parsed.measureUnit && core.unit === 'ml' && parsed.unit === 'g') {
            const ml =
              (parsed.measureAmount ?? 0) *
              (parsed.measureUnit === 'tsp' ? ML_PER_TSP : ML_PER_TBSP)
            parsed.amount = Math.round(ml * 10) / 10
            parsed.unit = 'ml'
            parsed.gramsPerMl = undefined
          } else if (core && parsed.measureUnit && core.unit === 'g') {
            const dens = core.gramsPerMl ?? densityForName(parsed.name)
            const ml =
              (parsed.measureAmount ?? 0) *
              (parsed.measureUnit === 'tsp' ? ML_PER_TSP : ML_PER_TBSP)
            parsed.amount = Math.round(ml * dens * 10) / 10
            parsed.unit = 'g'
            parsed.gramsPerMl = dens
          }

          const prev = seenIng.get(keyName)
          if (prev) {
            mergeIngredientRows(prev, parsed)
          } else {
            const row = {
              ...seedIngredientRow(parsed),
              measureAmount: parsed.measureAmount,
            }
            seenIng.set(keyName, row)
            ingredientNames.push(row)
          }
          upsertIngredientMeta(ingredientMeta, coreByName, parsed)
        }
      }

      // Strip internal merge helper before writing
      for (const row of ingredientNames) {
        delete row.measureAmount
      }

      if (ingredientNames.length === 0) {
        ingredientNames.push({ name: 'Salt', amount: 1 })
      }

      const fallbackStorage = mapStorage(key, title)
      const storage = extractStorageFromSteps(steps, fallbackStorage)
      recipes.push({
        name: title,
        description: `From Just One Cookbook — batch-friendly Japanese home cooking.`,
        source: raw.url,
        tips,
        category: mapCategory(key, title),
        effort: mapEffort(storage.steps.length),
        portions: 4,
        imageDataUrl: `/recipes/joc/${imageFile}`,
        storageDays: storage.storageDays,
        storageEnv: storage.storageEnv,
        storageInstructions: storage.storageInstructions,
        seeded: true,
        recipeKind: 'dish',
        steps: storage.steps,
        ingredientNames,
      })
    }
  }

  const ingredients = [...ingredientMeta.values()].map((meta) => {
    const nutrition = NUTRITION_BY_CATEGORY[meta.category] ?? NUTRITION_BY_CATEGORY.vegetables
    const low =
      meta.unit === 'pcs' ? 4 : meta.category === 'oils' || meta.category === 'spices' ? 30 : 50
    const row = {
      name: meta.name,
      category: meta.category,
      unit: meta.unit,
      nutritionPer100: { ...nutrition },
      lowStockThreshold: low,
    }
    if (meta.unit === 'pcs') row.avgPieceGrams = 50
    if (meta.unit === 'g' && meta.gramsPerMl != null) row.gramsPerMl = meta.gramsPerMl
    return row
  })
  ingredients.sort((a, b) => a.name.localeCompare(b.name))
  recipes.sort((a, b) => a.name.localeCompare(b.name))

  const payload = {
    generatedAt: new Date().toISOString(),
    ingredientCount: ingredients.length,
    recipeCount: recipes.length,
    ingredients,
    recipes,
  }
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2))
  console.log(`Wrote ${outJson}`)
  console.log(`Ingredients: ${ingredients.length}, Recipes: ${recipes.length}`)

  console.log(`Downloading ${downloads.length} images…`)
  let ok = 0
  let skip = 0
  let fail = 0
  await mapPool(downloads, 6, async ({ url, dest }) => {
    try {
      const r = await download(url, dest)
      if (r === 'skip') skip++
      else ok++
      process.stdout.write('.')
    } catch (e) {
      fail++
      console.warn(`\nFail ${url}: ${e.message}`)
    }
  })
  console.log(`\nImages: ${ok} downloaded, ${skip} cached, ${fail} failed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
