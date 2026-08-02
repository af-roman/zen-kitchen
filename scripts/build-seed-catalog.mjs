/**
 * Build starter catalog from recipe_scrape/*.json:
 * - download hero + step images → public/recipes/{slug}/
 * - write src/db/seed-catalog/catalog.json
 *
 * Usage: node scripts/build-seed-catalog.mjs
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SCRAPE_DIR = path.join(ROOT, 'recipe_scrape')
const PUBLIC_DIR = path.join(ROOT, 'public', 'recipes')
const OUT_FILE = path.join(ROOT, 'src', 'db', 'seed-catalog', 'catalog.json')

/** @type {Record<string, object>} */
const INGREDIENTS = {
  tap_water: {
    name: 'Tap water',
    category: 'staples',
    unit: 'ml',
    alwaysAvailable: true,
    nutritionPer100: { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
    lowStockThreshold: 0,
  },
  onion: {
    name: 'Onion',
    category: 'vegetables',
    unit: 'pcs',
    avgPieceGrams: 150,
    nutritionPer100: { energyKcal: 40, fatG: 0.1, carbsG: 9.3, proteinG: 1.1 },
    lowStockThreshold: 2,
  },
  green_onion: {
    name: 'Green onion / scallion',
    category: 'vegetables',
    unit: 'pcs',
    avgPieceGrams: 15,
    nutritionPer100: { energyKcal: 32, fatG: 0.2, carbsG: 7.3, proteinG: 1.8 },
    lowStockThreshold: 3,
  },
  green_cabbage: {
    name: 'Green cabbage',
    category: 'vegetables',
    unit: 'g',
    nutritionPer100: { energyKcal: 25, fatG: 0.1, carbsG: 5.8, proteinG: 1.3 },
    lowStockThreshold: 200,
  },
  carrot: {
    name: 'Carrot',
    category: 'vegetables',
    unit: 'pcs',
    avgPieceGrams: 95,
    nutritionPer100: { energyKcal: 41, fatG: 0.2, carbsG: 9.6, proteinG: 0.9 },
    lowStockThreshold: 3,
  },
  potato: {
    name: 'Potato',
    category: 'vegetables',
    unit: 'pcs',
    avgPieceGrams: 150,
    nutritionPer100: { energyKcal: 77, fatG: 0.1, carbsG: 17.5, proteinG: 2 },
    lowStockThreshold: 3,
  },
  english_cucumber: {
    name: 'English cucumber',
    category: 'vegetables',
    unit: 'pcs',
    avgPieceGrams: 300,
    nutritionPer100: { energyKcal: 15, fatG: 0.1, carbsG: 3.6, proteinG: 0.7 },
    lowStockThreshold: 2,
  },
  red_radish: {
    name: 'Red radish',
    category: 'vegetables',
    unit: 'pcs',
    avgPieceGrams: 20,
    nutritionPer100: { energyKcal: 16, fatG: 0.1, carbsG: 3.4, proteinG: 0.7 },
    lowStockThreshold: 4,
  },
  apple: {
    name: 'Apple',
    category: 'fruit',
    unit: 'pcs',
    avgPieceGrams: 180,
    nutritionPer100: { energyKcal: 52, fatG: 0.2, carbsG: 14, proteinG: 0.3 },
    lowStockThreshold: 2,
  },
  garlic_clove: {
    name: 'Garlic clove',
    category: 'vegetables',
    unit: 'pcs',
    avgPieceGrams: 5,
    nutritionPer100: { energyKcal: 149, fatG: 0.5, carbsG: 33, proteinG: 6.4 },
    lowStockThreshold: 6,
  },
  ginger: {
    name: 'Ginger',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 0.9,
    nutritionPer100: { energyKcal: 80, fatG: 0.8, carbsG: 18, proteinG: 1.8 },
    lowStockThreshold: 30,
  },
  egg: {
    name: 'Egg',
    category: 'proteins',
    unit: 'pcs',
    avgPieceGrams: 50,
    nutritionPer100: { energyKcal: 143, fatG: 9.5, carbsG: 0.7, proteinG: 12.6 },
    lowStockThreshold: 6,
  },
  chicken_thigh: {
    name: 'Chicken thigh (boneless, skinless)',
    category: 'proteins',
    unit: 'g',
    nutritionPer100: { energyKcal: 121, fatG: 3.9, carbsG: 0, proteinG: 21 },
    lowStockThreshold: 300,
  },
  salmon_fillet: {
    name: 'Salmon fillet',
    category: 'proteins',
    unit: 'g',
    nutritionPer100: { energyKcal: 208, fatG: 13, carbsG: 0, proteinG: 20 },
    lowStockThreshold: 300,
  },
  short_grain_rice: {
    name: 'Japanese short-grain rice',
    category: 'staples',
    unit: 'g',
    nutritionPer100: { energyKcal: 130, fatG: 0.2, carbsG: 28.7, proteinG: 2.4 },
    lowStockThreshold: 500,
  },
  instant_dashi_packet: {
    name: 'Instant dashi (packet)',
    category: 'seaweed',
    unit: 'pcs',
    avgPieceGrams: 5,
    nutritionPer100: { energyKcal: 219, fatG: 0.2, carbsG: 35.5, proteinG: 19.1 },
    lowStockThreshold: 10,
  },
  dashi: {
    name: 'Dashi',
    category: 'seaweed',
    unit: 'ml',
    nutritionPer100: { energyKcal: 3, fatG: 0, carbsG: 0.2, proteinG: 0.5 },
    lowStockThreshold: 250,
  },
  wakame_dried: {
    name: 'Wakame (dried)',
    category: 'seaweed',
    unit: 'g',
    gramsPerMl: 0.15,
    nutritionPer100: { energyKcal: 45, fatG: 0.6, carbsG: 9.1, proteinG: 3 },
    lowStockThreshold: 20,
  },
  miso_shiro: {
    name: 'Miso shiro',
    category: 'ferments',
    unit: 'g',
    gramsPerMl: 1.07,
    nutritionPer100: { energyKcal: 196, fatG: 5.5, carbsG: 25, proteinG: 11 },
    lowStockThreshold: 100,
  },
  soy_sauce: {
    name: 'Soy sauce',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 53, fatG: 0.1, carbsG: 4.9, proteinG: 8.1 },
    lowStockThreshold: 100,
  },
  mirin: {
    name: 'Mirin',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 241, fatG: 0, carbsG: 43.5, proteinG: 0.1 },
    lowStockThreshold: 100,
  },
  sake: {
    name: 'Sake',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 134, fatG: 0, carbsG: 5, proteinG: 0.5 },
    lowStockThreshold: 100,
  },
  rice_vinegar: {
    name: 'Rice vinegar',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 18, fatG: 0, carbsG: 0.1, proteinG: 0 },
    lowStockThreshold: 100,
  },
  japanese_curry_roux: {
    name: 'Japanese curry roux',
    category: 'staples',
    unit: 'pcs',
    avgPieceGrams: 215,
    nutritionPer100: { energyKcal: 480, fatG: 28, carbsG: 50, proteinG: 6 },
    lowStockThreshold: 1,
  },
  chicken_stock: {
    name: 'Chicken stock',
    category: 'staples',
    unit: 'ml',
    nutritionPer100: { energyKcal: 6, fatG: 0.2, carbsG: 0.4, proteinG: 0.6 },
    lowStockThreshold: 500,
  },
  neutral_oil: {
    name: 'Neutral oil',
    category: 'oils',
    unit: 'ml',
    nutritionPer100: { energyKcal: 884, fatG: 100, carbsG: 0, proteinG: 0 },
    lowStockThreshold: 100,
  },
  sesame_oil: {
    name: 'Toasted sesame oil',
    category: 'oils',
    unit: 'ml',
    nutritionPer100: { energyKcal: 884, fatG: 100, carbsG: 0, proteinG: 0 },
    lowStockThreshold: 50,
  },
  sugar: {
    name: 'Sugar',
    category: 'sweeteners',
    unit: 'g',
    gramsPerMl: 0.85,
    nutritionPer100: { energyKcal: 387, fatG: 0, carbsG: 100, proteinG: 0 },
    lowStockThreshold: 100,
  },
  honey: {
    name: 'Honey',
    category: 'sweeteners',
    unit: 'g',
    gramsPerMl: 1.42,
    nutritionPer100: { energyKcal: 304, fatG: 0, carbsG: 82, proteinG: 0.3 },
    lowStockThreshold: 100,
  },
  ketchup: {
    name: 'Ketchup',
    category: 'ferments',
    unit: 'g',
    gramsPerMl: 1.15,
    nutritionPer100: { energyKcal: 112, fatG: 0.2, carbsG: 26, proteinG: 1.2 },
    lowStockThreshold: 100,
  },
  salt: {
    name: 'Salt',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 1.2,
    nutritionPer100: { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
    lowStockThreshold: 50,
  },
  black_pepper: {
    name: 'Black pepper (ground)',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 0.5,
    nutritionPer100: { energyKcal: 251, fatG: 3.3, carbsG: 64, proteinG: 10 },
    lowStockThreshold: 20,
  },
  sesame_seeds: {
    name: 'Toasted sesame seeds',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 0.6,
    nutritionPer100: { energyKcal: 573, fatG: 50, carbsG: 23, proteinG: 17 },
    lowStockThreshold: 30,
  },
  shichimi: {
    name: 'Shichimi togarashi',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 0.45,
    nutritionPer100: { energyKcal: 300, fatG: 12, carbsG: 40, proteinG: 12 },
    lowStockThreshold: 20,
  },
  sansho: {
    name: 'Japanese sansho pepper',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 0.4,
    nutritionPer100: { energyKcal: 280, fatG: 10, carbsG: 45, proteinG: 8 },
    lowStockThreshold: 15,
  },
  mitsuba: {
    name: 'Mitsuba (Japanese parsley)',
    category: 'vegetables',
    unit: 'pcs',
    avgPieceGrams: 3,
    nutritionPer100: { energyKcal: 23, fatG: 0.2, carbsG: 3.5, proteinG: 2 },
    lowStockThreshold: 4,
  },
  fukujinzuke: {
    name: 'Fukujinzuke',
    category: 'pickles',
    unit: 'g',
    nutritionPer100: { energyKcal: 80, fatG: 0.2, carbsG: 18, proteinG: 1 },
    lowStockThreshold: 50,
  },
}

/**
 * Per-scrape ingredient lines (stock amount + optional measureUnit).
 * Amounts are in the ingredient stock unit unless measureUnit is tsp/tbsp.
 */
const RECIPE_LINES = {
  cabbage_and_onsen_tamago_miso_soup: [
    { key: 'onion', amount: 0.25 },
    { key: 'tap_water', amount: 750 },
    { key: 'instant_dashi_packet', amount: 2 },
    { key: 'green_cabbage', amount: 100 },
    { key: 'miso_shiro', amount: 3, measureUnit: 'tbsp' },
    { key: 'egg', amount: 3 },
    { key: 'green_onion', amount: 1 },
    { key: 'shichimi', amount: 0.25, measureUnit: 'tsp' },
    { key: 'sansho', amount: 0.25, measureUnit: 'tsp' },
  ],
  japanese_cucumber_salad_sunomono: [
    { key: 'rice_vinegar', amount: 60 },
    { key: 'sugar', amount: 2, measureUnit: 'tbsp' },
    { key: 'salt', amount: 0.5, measureUnit: 'tsp' },
    { key: 'soy_sauce', amount: 0.5, measureUnit: 'tsp' },
    { key: 'english_cucumber', amount: 1 },
    { key: 'salt', amount: 1, measureUnit: 'tsp' },
    { key: 'wakame_dried', amount: 1, measureUnit: 'tbsp' },
    { key: 'sesame_seeds', amount: 0.5, measureUnit: 'tbsp' },
    { key: 'red_radish', amount: 2 },
  ],
  miso_salmon: [
    { key: 'salmon_fillet', amount: 350 },
    { key: 'miso_shiro', amount: 2, measureUnit: 'tbsp' },
    { key: 'sake', amount: 1, measureUnit: 'tbsp' },
    { key: 'mirin', amount: 1, measureUnit: 'tbsp' },
    { key: 'soy_sauce', amount: 1, measureUnit: 'tbsp' },
    { key: 'sesame_oil', amount: 0.25, measureUnit: 'tsp' },
    { key: 'sesame_seeds', amount: 0.5, measureUnit: 'tsp' },
    { key: 'green_onion', amount: 1 },
  ],
  japanese_chicken_curry: [
    { key: 'onion', amount: 2 },
    { key: 'carrot', amount: 2 },
    { key: 'potato', amount: 3 },
    { key: 'ginger', amount: 1, measureUnit: 'tsp' },
    { key: 'garlic_clove', amount: 2 },
    { key: 'apple', amount: 0.5 },
    { key: 'chicken_thigh', amount: 700 },
    { key: 'black_pepper', amount: 0.5, measureUnit: 'tsp' },
    { key: 'neutral_oil', amount: 1.5, measureUnit: 'tbsp' },
    { key: 'chicken_stock', amount: 1000 },
    { key: 'honey', amount: 1, measureUnit: 'tbsp' },
    { key: 'soy_sauce', amount: 1, measureUnit: 'tbsp' },
    { key: 'ketchup', amount: 1, measureUnit: 'tbsp' },
    { key: 'japanese_curry_roux', amount: 1 },
    { key: 'short_grain_rice', amount: 550 },
    { key: 'fukujinzuke', amount: 50 },
  ],
  oyakodon_chicken_and_egg_rice_bowl: [
    { key: 'onion', amount: 0.5 },
    { key: 'chicken_thigh', amount: 300 },
    { key: 'sake', amount: 1, measureUnit: 'tbsp' },
    { key: 'egg', amount: 4 },
    { key: 'dashi', amount: 120 },
    { key: 'soy_sauce', amount: 2, measureUnit: 'tbsp' },
    { key: 'mirin', amount: 2, measureUnit: 'tbsp' },
    { key: 'sugar', amount: 2, measureUnit: 'tsp' },
    { key: 'short_grain_rice', amount: 300 },
    { key: 'mitsuba', amount: 4 },
    { key: 'shichimi', amount: 0.5, measureUnit: 'tsp' },
    { key: 'sansho', amount: 0.5, measureUnit: 'tsp' },
  ],
}

const RECIPE_META = {
  cabbage_and_onsen_tamago_miso_soup: {
    category: 'soup',
    technique: 'simmered',
    effort: 'easy',
  },
  japanese_cucumber_salad_sunomono: {
    category: 'side',
    technique: 'raw',
    effort: 'easy',
  },
  miso_salmon: {
    category: 'main',
    technique: 'grilled',
    effort: 'easy',
  },
  japanese_chicken_curry: {
    category: 'main',
    technique: 'simmered',
    effort: 'medium',
  },
  oyakodon_chicken_and_egg_rice_bowl: {
    category: 'main',
    technique: 'simmered',
    effort: 'easy',
  },
}

/** Groups to omit from the canonical seed cook path. */
const DROP_GROUPS = {
  japanese_chicken_curry: new Set(['to reheat']),
  oyakodon_chicken_and_egg_rice_bowl: new Set([
    'to cook in an oyakodon pan or a small frying pan',
  ]),
}

const ML_PER_TSP = 5
const ML_PER_TBSP = 15

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60)
}

function uid() {
  return createHash('sha1').update(`${Math.random()}-${Date.now()}`).digest('hex').slice(0, 12)
}

function toStockAmount(amount, measureUnit, ingredient) {
  if (!measureUnit || measureUnit === ingredient.unit) return amount
  if (measureUnit === 'tsp' || measureUnit === 'tbsp') {
    const ml = amount * (measureUnit === 'tsp' ? ML_PER_TSP : ML_PER_TBSP)
    if (ingredient.unit === 'ml') return round1(ml)
    if (ingredient.unit === 'g') {
      const density = ingredient.gramsPerMl
      if (!density) throw new Error(`${ingredient.name}: needs gramsPerMl for spoons`)
      return round1(ml * density)
    }
  }
  return amount
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function extFromUrl(url) {
  try {
    const p = new URL(url).pathname
    const ext = path.extname(p).toLowerCase()
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext
  } catch {
    /* ignore */
  }
  return '.jpg'
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'zen-kitchen-seed-builder/1.0' },
  })
  if (!res.ok) throw new Error(`Failed ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(dest, buf)
  return dest
}

async function cleanCdnUrl(url) {
  // JOC CDN sometimes wraps with spai transforms — prefer original host path when present.
  const m = url.match(/www\.justonecookbook\.com\/wp-content\/uploads\/[^?\s]+/)
  if (m) return `https://${m[0]}`
  return url
}

async function main() {
  const files = (await readdir(SCRAPE_DIR)).filter((f) => f.endsWith('.json')).sort()
  if (!files.length) throw new Error('No scrape JSON files found')

  await mkdir(path.dirname(OUT_FILE), { recursive: true })
  await mkdir(PUBLIC_DIR, { recursive: true })

  const usedKeys = new Set()
  const recipes = []

  for (const file of files) {
    const slug = file.replace(/\.json$/, '')
    const scrape = JSON.parse(await readFile(path.join(SCRAPE_DIR, file), 'utf8'))
    const lines = RECIPE_LINES[slug]
    const meta = RECIPE_META[slug]
    if (!lines || !meta) throw new Error(`Missing RECIPE_LINES/META for ${slug}`)

    for (const line of lines) {
      if (!INGREDIENTS[line.key]) throw new Error(`Unknown ingredient key ${line.key}`)
      usedKeys.add(line.key)
    }

    const outDir = path.join(PUBLIC_DIR, slug)
    await mkdir(outDir, { recursive: true })

    const heroUrl = await cleanCdnUrl(scrape.imageUrl)
    const heroExt = extFromUrl(heroUrl)
    const heroRel = `/recipes/${slug}/hero${heroExt}`
    console.log('hero', slug)
    await download(heroUrl, path.join(PUBLIC_DIR, slug, `hero${heroExt}`))

    const drop = DROP_GROUPS[slug] ?? new Set()
    const steps = []
    let imgIndex = 0
    for (const group of scrape.instructions ?? []) {
      if (drop.has(String(group.group ?? '').trim().toLowerCase())) continue
      for (const step of group.steps ?? []) {
        let imageDataUrl
        const firstImg = (step.images ?? [])[0]
        if (firstImg) {
          imgIndex += 1
          const url = await cleanCdnUrl(firstImg)
          const ext = extFromUrl(url)
          const fname = `step-${String(imgIndex).padStart(2, '0')}${ext}`
          try {
            await download(url, path.join(outDir, fname))
            imageDataUrl = `/recipes/${slug}/${fname}`
          } catch (e) {
            console.warn('skip image', url, e.message)
          }
        }
        steps.push({
          id: uid(),
          description: String(step.text ?? '').trim(),
          requiresTimer: Boolean(step.requiresTimer),
          timerDuration: step.requiresTimer ? step.timerDuration : undefined,
          timerUnit: step.requiresTimer ? step.timerUnit : undefined,
          imageDataUrl,
          group: String(group.group ?? 'Main').trim() || 'Main',
        })
      }
    }

    const storage = (scrape.storage ?? [])[0] ?? {}
    const tips = []
    for (const block of scrape.chefTips ?? []) {
      for (const item of block.items ?? []) tips.push(String(item))
    }

    const ingredientLines = lines.map((line) => {
      const ing = INGREDIENTS[line.key]
      const measureUnit = line.measureUnit
      const stockAmount = toStockAmount(line.amount, measureUnit, ing)
      return {
        ingredientKey: line.key,
        amount: stockAmount,
        measureUnit:
          measureUnit && measureUnit !== ing.unit ? measureUnit : undefined,
      }
    })

    recipes.push({
      name: scrape.title,
      description: scrape.description ?? '',
      source: scrape.url,
      youtubeUrl: scrape.videoUrl || undefined,
      tips,
      recipeKind: 'dish',
      category: meta.category,
      technique: meta.technique,
      effort: meta.effort,
      portions: Number(scrape.servings) || 2,
      imageDataUrl: heroRel,
      ingredientLines,
      steps,
      storageInstructions: storage.text || undefined,
      fridgeDays: storage.storageDaysFridge || undefined,
      freezerDays: storage.storageDaysFreezer || undefined,
      storageDays: storage.storageDaysFridge || storage.storageDaysFreezer || 3,
      storageEnv: storage.storageDaysFridge ? 'fridge' : storage.storageDaysFreezer ? 'freezer' : 'fridge',
      seeded: true,
    })
  }

  // Always include tap water in catalog even if unused (built-in also ensures it).
  usedKeys.add('tap_water')

  const ingredients = [...usedKeys].sort().map((key) => ({
    key,
    ...INGREDIENTS[key],
  }))

  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    ingredients,
    recipes,
  }

  await writeFile(OUT_FILE, JSON.stringify(catalog, null, 2))
  console.log(`Wrote ${OUT_FILE}`)
  console.log(`Ingredients: ${ingredients.length}, recipes: ${recipes.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
