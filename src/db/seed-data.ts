import type { Ingredient, MeasureUnit, Recipe } from '@/domain/types'
import { uid } from '@/domain/kitchen'

type SeedIngredient = Omit<Ingredient, 'id' | 'createdAt'>

export const SEED_INGREDIENTS: SeedIngredient[] = [
  {
    name: 'Short-grain rice',
    category: 'staples',
    unit: 'g',
    nutritionPer100: { energyKcal: 358, fatG: 0.6, carbsG: 79, proteinG: 6.7 },
    lowStockThreshold: 200,
  },
  {
    name: 'Soba noodles',
    category: 'staples',
    unit: 'g',
    nutritionPer100: { energyKcal: 336, fatG: 1.1, carbsG: 71, proteinG: 14 },
    lowStockThreshold: 100,
  },
  {
    name: 'Chicken breast',
    category: 'proteins',
    unit: 'g',
    nutritionPer100: { energyKcal: 110, fatG: 1.2, carbsG: 0, proteinG: 23 },
    lowStockThreshold: 200,
  },
  {
    name: 'Chicken thighs',
    category: 'proteins',
    unit: 'g',
    nutritionPer100: { energyKcal: 177, fatG: 10.9, carbsG: 0, proteinG: 19 },
    lowStockThreshold: 250,
  },
  {
    name: 'Salmon fillet',
    category: 'proteins',
    unit: 'g',
    nutritionPer100: { energyKcal: 208, fatG: 13, carbsG: 0, proteinG: 20 },
    lowStockThreshold: 150,
  },
  {
    name: 'Firm tofu',
    category: 'proteins',
    unit: 'g',
    nutritionPer100: { energyKcal: 78, fatG: 4.8, carbsG: 1.9, proteinG: 8.1 },
    lowStockThreshold: 200,
  },
  {
    name: 'Eggs',
    category: 'proteins',
    unit: 'pcs',
    avgPieceGrams: 55,
    nutritionPer100: { energyKcal: 143, fatG: 9.5, carbsG: 0.7, proteinG: 12.6 },
    lowStockThreshold: 4,
  },
  {
    name: 'Carrot',
    category: 'vegetables',
    unit: 'g',
    nutritionPer100: { energyKcal: 41, fatG: 0.2, carbsG: 10, proteinG: 0.9 },
    lowStockThreshold: 150,
  },
  {
    name: 'Spring onion',
    category: 'vegetables',
    unit: 'g',
    nutritionPer100: { energyKcal: 32, fatG: 0.2, carbsG: 7, proteinG: 1.8 },
    lowStockThreshold: 50,
  },
  {
    name: 'Shiitake mushrooms',
    category: 'vegetables',
    unit: 'g',
    nutritionPer100: { energyKcal: 34, fatG: 0.5, carbsG: 7, proteinG: 2.2 },
    lowStockThreshold: 100,
  },
  {
    name: 'Spinach',
    category: 'vegetables',
    unit: 'g',
    nutritionPer100: { energyKcal: 23, fatG: 0.4, carbsG: 3.6, proteinG: 2.9 },
    lowStockThreshold: 100,
  },
  {
    name: 'Daikon radish',
    category: 'vegetables',
    unit: 'g',
    nutritionPer100: { energyKcal: 18, fatG: 0.1, carbsG: 4.1, proteinG: 0.6 },
    lowStockThreshold: 200,
  },
  {
    name: 'Edamame',
    category: 'vegetables',
    unit: 'g',
    nutritionPer100: { energyKcal: 121, fatG: 5.2, carbsG: 8.9, proteinG: 11.9 },
    lowStockThreshold: 150,
  },
  {
    name: 'Nori sheets',
    category: 'seaweed',
    unit: 'pcs',
    avgPieceGrams: 3,
    nutritionPer100: { energyKcal: 35, fatG: 0.3, carbsG: 5, proteinG: 6 },
    lowStockThreshold: 5,
  },
  {
    name: 'Kombu',
    category: 'seaweed',
    unit: 'g',
    nutritionPer100: { energyKcal: 43, fatG: 0.6, carbsG: 10, proteinG: 1.7 },
    lowStockThreshold: 20,
  },
  {
    name: 'Katsuobushi',
    category: 'seaweed',
    unit: 'g',
    nutritionPer100: { energyKcal: 356, fatG: 3.5, carbsG: 0.5, proteinG: 77 },
    lowStockThreshold: 20,
  },
  {
    name: 'White miso',
    category: 'ferments',
    unit: 'g',
    gramsPerMl: 1.2,
    nutritionPer100: { energyKcal: 199, fatG: 6, carbsG: 26, proteinG: 12 },
    lowStockThreshold: 50,
  },
  {
    name: 'All-purpose miso sauce',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 180, fatG: 3, carbsG: 28, proteinG: 6 },
    lowStockThreshold: 40,
  },
  {
    name: 'Soy sauce',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 53, fatG: 0.1, carbsG: 5, proteinG: 8 },
    lowStockThreshold: 50,
  },
  {
    name: 'Mirin',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 241, fatG: 0, carbsG: 45, proteinG: 0.1 },
    lowStockThreshold: 50,
  },
  {
    name: 'Sake',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 134, fatG: 0, carbsG: 5, proteinG: 0.5 },
    lowStockThreshold: 50,
  },
  {
    name: 'Salt',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 1.2,
    nutritionPer100: { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
    lowStockThreshold: 30,
  },
  {
    name: 'Rice vinegar',
    category: 'ferments',
    unit: 'ml',
    nutritionPer100: { energyKcal: 18, fatG: 0, carbsG: 0.5, proteinG: 0 },
    lowStockThreshold: 50,
  },
  {
    name: 'Sesame oil',
    category: 'oils',
    unit: 'ml',
    nutritionPer100: { energyKcal: 884, fatG: 100, carbsG: 0, proteinG: 0 },
    lowStockThreshold: 30,
  },
  {
    name: 'Neutral oil',
    category: 'oils',
    unit: 'ml',
    nutritionPer100: { energyKcal: 884, fatG: 100, carbsG: 0, proteinG: 0 },
    lowStockThreshold: 50,
  },
  {
    name: 'Toasted sesame seeds',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 0.6,
    nutritionPer100: { energyKcal: 573, fatG: 50, carbsG: 23, proteinG: 18 },
    lowStockThreshold: 20,
  },
  {
    name: 'Ginger',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 0.9,
    nutritionPer100: { energyKcal: 80, fatG: 0.8, carbsG: 18, proteinG: 1.8 },
    lowStockThreshold: 20,
  },
  {
    name: 'Garlic',
    category: 'spices',
    unit: 'g',
    gramsPerMl: 0.6,
    nutritionPer100: { energyKcal: 149, fatG: 0.5, carbsG: 33, proteinG: 6.4 },
    lowStockThreshold: 20,
  },
  {
    name: 'Sugar',
    category: 'sweeteners',
    unit: 'g',
    gramsPerMl: 0.85,
    nutritionPer100: { energyKcal: 387, fatG: 0, carbsG: 100, proteinG: 0 },
    lowStockThreshold: 50,
  },
  {
    name: 'Cucumber',
    category: 'vegetables',
    unit: 'g',
    nutritionPer100: { energyKcal: 15, fatG: 0.1, carbsG: 3.6, proteinG: 0.7 },
    lowStockThreshold: 150,
  },
  {
    name: 'Wakame (dried)',
    category: 'seaweed',
    unit: 'g',
    nutritionPer100: { energyKcal: 45, fatG: 0.6, carbsG: 9, proteinG: 3 },
    lowStockThreshold: 15,
  },
]

function step(
  description: string,
  timer?: { duration: number; unit: 'seconds' | 'minutes' | 'hours' },
  group?: string,
  /** 0 = cook day (default), 1 = day before, … */
  daysAhead?: number,
) {
  return {
    id: uid(),
    description,
    requiresTimer: Boolean(timer),
    timerDuration: timer?.duration,
    timerUnit: timer?.unit,
    group,
    daysAhead,
  }
}

/** Recipes reference ingredients by name; resolved to IDs during seed. */
export type SeedRecipeDraft = Omit<
  Recipe,
  'id' | 'createdAt' | 'updatedAt' | 'ingredients' | 'yieldIngredientId'
> & {
  ingredientNames: {
    name: string
    /** Stock amount (g / ml / pcs) */
    amount: number
    /** Display/entry unit when different from ingredient stock unit (tsp / tbsp) */
    measureUnit?: MeasureUnit
    /** Stage that consumes the line; 0 = cook day (default) */
    daysAhead?: number
  }[]
  /** Prep only: resolved to yieldIngredientId during seed */
  yieldIngredientName?: string
}

export const SEED_RECIPE_DRAFTS: SeedRecipeDraft[] = [
  {
    name: 'Homemade all-purpose miso sauce',
    description:
      'A sweet-savoury miso base for marinades and glazes — cook once, keep in the fridge, use across the week.',
    tips: [
      'Whisk until completely smooth so the sauce coats evenly.',
      'Store in a clean jar; scoop with a dry spoon to keep it longer.',
    ],
    recipeKind: 'prep',
    yieldIngredientName: 'All-purpose miso sauce',
    yieldAmount: 300,
    category: 'other',
    effort: 'easy',
    portions: 1,
    storageDays: 21,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Add white miso, mirin, sake, and sugar to a small saucepan.', undefined, 'Mix'),
      step(
        'Warm gently on low, whisking until sugar dissolves and the sauce is smooth — do not boil.',
        { duration: 5, unit: 'minutes' },
        'Cook',
      ),
      step('Cool, then jar. Label as homemade all-purpose miso sauce.', undefined, 'Store'),
    ],
    ingredientNames: [
      { name: 'White miso', amount: 150 },
      { name: 'Mirin', amount: 75 },
      { name: 'Sake', amount: 60 },
      { name: 'Sugar', amount: 30 },
    ],
  },
  {
    name: 'Everyday miso soup',
    description: 'A calming bowl of dashi, wakame, tofu, and white miso — batch the dashi base.',
    tips: ['Never boil miso; whisk it in off the heat to keep the flavour soft.'],
    category: 'soup',
    effort: 'easy',
    portions: 4,
    storageDays: 3,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Soak wakame in cool water until soft, then drain.', undefined, 'Wakame'),
      step('Simmer kombu in 1 L water for 10 minutes; remove kombu.', {
        duration: 10,
        unit: 'minutes',
      }, 'Dashi'),
      step('Add katsuobushi, steep 3 minutes, strain dashi.', { duration: 3, unit: 'minutes' }, 'Dashi'),
      step('Add cubed tofu and wakame; warm gently.', undefined, 'Soup'),
      step('Turn off heat; whisk in miso until dissolved. Finish with spring onion.', undefined, 'Soup'),
    ],
    ingredientNames: [
      { name: 'White miso', amount: 60 },
      { name: 'Firm tofu', amount: 200 },
      { name: 'Wakame (dried)', amount: 8 },
      { name: 'Kombu', amount: 10 },
      { name: 'Katsuobushi', amount: 15 },
      { name: 'Spring onion', amount: 40 },
    ],
  },
  {
    name: 'Batch short-grain rice',
    description: 'Fluffy Japanese rice for the week — cool, portion, and reheat gently.',
    tips: ['Rinse until the water runs almost clear; rest 10 minutes after cooking.'],
    category: 'rice',
    effort: 'easy',
    portions: 6,
    storageDays: 4,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Rinse rice in cool water until mostly clear.', undefined, 'Rice'),
      step('Soak 20 minutes, then drain.', { duration: 20, unit: 'minutes' }, 'Rice'),
      step('Cook with equal water by volume; simmer covered 12 minutes.', {
        duration: 12,
        unit: 'minutes',
      }, 'Cook'),
      step('Rest off heat, covered, 10 minutes. Fluff with a rice paddle.', {
        duration: 10,
        unit: 'minutes',
      }, 'Cook'),
    ],
    ingredientNames: [{ name: 'Short-grain rice', amount: 600 }],
  },
  {
    name: 'Ginger chicken simmer',
    description: 'Tender chicken breast gently simmered with soy, mirin, and ginger.',
    tips: ['Slice against the grain after resting so the meat stays juicy when reheated.'],
    category: 'simmered',
    effort: 'medium',
    portions: 4,
    storageDays: 3,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Slice chicken into bite-size pieces; grate ginger.', undefined, 'Prep'),
      step('Combine soy, mirin, a splash of water, and ginger in a pan.', undefined, 'Sauce'),
      step('Add chicken; simmer gently 12 minutes until just cooked.', {
        duration: 12,
        unit: 'minutes',
      }, 'Simmer'),
      step('Reduce sauce briefly; finish with spring onion.', undefined, 'Finish'),
    ],
    ingredientNames: [
      { name: 'Chicken breast', amount: 500 },
      { name: 'Soy sauce', amount: 40 },
      { name: 'Mirin', amount: 40 },
      { name: 'Ginger', amount: 20 },
      { name: 'Spring onion', amount: 30 },
      { name: 'Sugar', amount: 10 },
    ],
  },
  {
    name: 'Miso-glazed salmon',
    description: 'Salmon fillets brushed with miso-mirin glaze — excellent cold or reheated.',
    tips: ['Pat fish dry so the glaze caramelises instead of steaming.'],
    category: 'grilled',
    effort: 'medium',
    portions: 4,
    storageDays: 3,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Mix white miso, mirin, and a touch of sugar into a paste.', undefined, 'Glaze'),
      step('Coat salmon; marinate 20 minutes.', { duration: 20, unit: 'minutes' }, 'Glaze'),
      step('Bake or pan-sear until just opaque, about 10 minutes.', {
        duration: 10,
        unit: 'minutes',
      }, 'Cook'),
    ],
    ingredientNames: [
      { name: 'Salmon fillet', amount: 500 },
      { name: 'White miso', amount: 40 },
      { name: 'Mirin', amount: 30 },
      { name: 'Sugar', amount: 8 },
    ],
  },
  {
    name: 'Spinach goma-ae',
    description: 'Blanched spinach dressed with toasted sesame — a light side for every meal.',
    tips: ['Squeeze spinach thoroughly so the dressing clings instead of pooling.'],
    category: 'sides',
    effort: 'easy',
    portions: 4,
    storageDays: 2,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Blanch spinach 45 seconds; plunge into ice water.', {
        duration: 45,
        unit: 'seconds',
      }, 'Spinach'),
      step('Squeeze dry; cut into lengths.', undefined, 'Spinach'),
      step('Crush sesame seeds; mix with soy and a pinch of sugar. Toss with spinach.', undefined, 'Dressing'),
    ],
    ingredientNames: [
      { name: 'Spinach', amount: 300 },
      { name: 'Toasted sesame seeds', amount: 30 },
      { name: 'Soy sauce', amount: 20 },
      { name: 'Sugar', amount: 5 },
    ],
  },
  {
    name: 'Kinpira-style carrots & daikon',
    description: 'Julienned root vegetables stir-fried and simmered in a sweet-savoury glaze.',
    tips: ['Keep the heat medium so the vegetables stay crisp-tender through the week.'],
    category: 'stirfry',
    effort: 'easy',
    portions: 4,
    storageDays: 4,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Julienne carrot and daikon into matchsticks.', undefined, 'Prep'),
      step('Stir-fry in a little oil 3 minutes.', { duration: 3, unit: 'minutes' }, 'Stir-fry'),
      step('Add soy, mirin, and sugar; simmer until glaze coats, about 5 minutes.', {
        duration: 5,
        unit: 'minutes',
      }, 'Glaze'),
      step('Finish with sesame seeds.', undefined, 'Finish'),
    ],
    ingredientNames: [
      { name: 'Carrot', amount: 250 },
      { name: 'Daikon radish', amount: 250 },
      { name: 'Neutral oil', amount: 15 },
      { name: 'Soy sauce', amount: 25 },
      { name: 'Mirin', amount: 25 },
      { name: 'Sugar', amount: 10 },
      { name: 'Toasted sesame seeds', amount: 10 },
    ],
  },
  {
    name: 'Quick cucumber pickles',
    description: 'Lightly salted cucumbers with rice vinegar — bright contrast to rich dishes.',
    tips: ['Salt first to draw water, then dress; they stay crisp longer.'],
    category: 'sides',
    effort: 'easy',
    portions: 4,
    storageDays: 5,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Slice cucumber thin; toss with salt and rest 15 minutes.', {
        duration: 15,
        unit: 'minutes',
      }),
      step('Rinse, squeeze gently, dress with rice vinegar and a pinch of sugar.'),
    ],
    ingredientNames: [
      { name: 'Cucumber', amount: 300 },
      { name: 'Rice vinegar', amount: 40 },
      { name: 'Sugar', amount: 8 },
      { name: 'Sesame oil', amount: 5 },
    ],
  },
  {
    name: 'Tamago soba bowl base',
    description: 'Chilled or warm soba with soft eggs — build bowls through the week.',
    tips: ['Cook noodles just shy of done; they soften when reheated in broth.'],
    category: 'bowl',
    effort: 'medium',
    portions: 4,
    storageDays: 3,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Boil soba according to pack; rinse under cold water.', {
        duration: 5,
        unit: 'minutes',
      }, 'Noodles'),
      step('Soft-boil eggs 7 minutes; ice bath and peel.', { duration: 7, unit: 'minutes' }, 'Eggs'),
      step('Portion noodles; store eggs separately. Serve with soy or dashi later.', undefined, 'Assembly'),
    ],
    ingredientNames: [
      { name: 'Soba noodles', amount: 320 },
      { name: 'Eggs', amount: 4 },
      { name: 'Soy sauce', amount: 30 },
      { name: 'Spring onion', amount: 40 },
      { name: 'Nori sheets', amount: 2 },
    ],
  },
  {
    name: 'Braised tofu with mushrooms',
    description: 'Firm tofu and shiitake simmered in a light soy-mirin broth.',
    tips: ['Press tofu 10 minutes first so it absorbs the seasoning.'],
    category: 'simmered',
    effort: 'easy',
    portions: 4,
    storageDays: 3,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Press tofu; cube. Slice shiitake.', undefined, 'Prep'),
      step('Sauté mushrooms in a little oil until fragrant.', undefined, 'Mushrooms'),
      step('Add tofu, soy, mirin, and water; simmer 10 minutes.', {
        duration: 10,
        unit: 'minutes',
      }, 'Simmer'),
      step('Finish with sesame oil and spring onion.', undefined, 'Finish'),
    ],
    ingredientNames: [
      { name: 'Firm tofu', amount: 400 },
      { name: 'Shiitake mushrooms', amount: 200 },
      { name: 'Soy sauce', amount: 30 },
      { name: 'Mirin', amount: 30 },
      { name: 'Sesame oil', amount: 10 },
      { name: 'Spring onion', amount: 30 },
      { name: 'Neutral oil', amount: 10 },
    ],
  },
  {
    name: 'Garlic edamame',
    description: 'Warm edamame tossed with garlic and a splash of soy — snack or side.',
    tips: ['Dry the pods well before tossing so the garlic sticks.'],
    category: 'sides',
    effort: 'easy',
    portions: 4,
    storageDays: 3,
    storageEnv: 'fridge',
    seeded: true,
    steps: [
      step('Boil edamame 4 minutes; drain well.', { duration: 4, unit: 'minutes' }, 'Pods'),
      step('Sauté minced garlic in sesame oil 30 seconds.', { duration: 30, unit: 'seconds' }, 'Garlic oil'),
      step('Toss pods with garlic oil and soy. Serve warm or cold.', undefined, 'Toss'),
    ],
    ingredientNames: [
      { name: 'Edamame', amount: 400 },
      { name: 'Garlic', amount: 12 },
      { name: 'Sesame oil', amount: 10 },
      { name: 'Soy sauce', amount: 15 },
    ],
  },
  {
    name: 'Miso chicken',
    description:
      'Crispy-skinned chicken thighs marinated in all-purpose miso sauce, pan-seared, then finished with a sweet-savoury miso glaze — excellent over rice through the week.',
    tips: [
      'Use boneless, skin-on chicken thighs — the skin crisps golden while the meat stays juicy.',
      'Prick the skin before marinating so fat renders evenly and the marinade penetrates.',
      'Marinate for 24 hours, no longer — less time and flavour stays light; longer and it gets too salty.',
      'Wipe the marinade off completely before cooking — wet skin won’t crisp.',
      'Start the chicken in a cold pan so fat renders gradually for crispier skin.',
      'Cook on medium-low — miso scorches easily, so steady heat browns without burning.',
    ],
    category: 'grilled',
    effort: 'medium',
    portions: 5,
    storageDays: 3,
    storageEnv: 'fridge',
    imageDataUrl: '/recipes/miso-chicken.jpg',
    seeded: true,
    steps: [
      step(
        'Make homemade all-purpose miso sauce ahead if you don’t have it (about 30 minutes). Gather the marinade ingredients.',
        undefined,
        'Before you start',
        1,
      ),
      step(
        'Prick the skin of 5 boneless, skin-on chicken thighs. Pat dry and place in a resealable bag with 75 ml all-purpose miso sauce. Seal, removing air.',
        undefined,
        'Marinate',
        1,
      ),
      step(
        'Rub through the bag to coat evenly. Refrigerate 24 hours — do not marinate longer or the chicken will get too salty.',
        { duration: 24, unit: 'hours' },
        'Marinate',
        1,
      ),
      step(
        'Remove chicken from the bag and wipe off all marinade with your hands, then pat dry with paper towels.',
        undefined,
        'Cook',
      ),
      step(
        'Add 15 ml neutral oil to a cold large frying pan and swirl to coat. Place chicken skin-side down with space between pieces (don’t overcrowd).',
        undefined,
        'Cook',
      ),
      step(
        'Set heat to medium-low. Cook skin-side down, undisturbed, 7 minutes — press occasionally — until skin is golden and edges are opaque. Do not cover.',
        { duration: 7, unit: 'minutes' },
        'Cook',
      ),
      step(
        'Flip and cook 5 minutes, pressing occasionally, until browned. Wipe away rendered fat with a paper towel.',
        { duration: 5, unit: 'minutes' },
        'Cook',
      ),
      step(
        'Cook until the thickest part reaches 74°C / 165°F. Rest on a board, then cut into 1.3 cm (½-inch) strips.',
        undefined,
        'Cook',
      ),
      step(
        'Wipe the pan clean. Add 75 ml all-purpose miso sauce and 75 ml water. Simmer on low, stirring, until the glaze coats a spoon. Turn off heat.',
        undefined,
        'Miso glaze',
      ),
      step(
        'Serve over steamed rice, drizzle with miso glaze, and top with toasted sesame seeds and chopped spring onion.',
        undefined,
        'Serve',
      ),
    ],
    ingredientNames: [
      { name: 'Chicken thighs', amount: 750, daysAhead: 1 },
      // Half the sauce goes into the marinade the day before, half into the glaze.
      { name: 'All-purpose miso sauce', amount: 75, daysAhead: 1 },
      { name: 'All-purpose miso sauce', amount: 75 },
      { name: 'Neutral oil', amount: 15 },
      { name: 'Toasted sesame seeds', amount: 3 },
      { name: 'Spring onion', amount: 20 },
    ],
  },
  {
    name: 'Salted salmon (shiozake)',
    description:
      'Japanese-style salt-cured salmon fillets — cure for 2 days, then broil until flaky. Classic with rice; portion about 80 g per serving.',
    tips: [
      'Use thin Japanese-style skin-on fillets; firmer sockeye is ideal if you’re slicing your own.',
      'Pat the salmon dry before salting so salt penetrates evenly.',
      'Salt all sides, including the skin, for better flavour and crisper broiled skin.',
      'Don’t rush the cure — full two days lets moisture draw out and flavour deepen.',
      'Serve with rice in small portions (~80 g), not as a large Western-style fillet.',
    ],
    category: 'grilled',
    effort: 'medium',
    portions: 8,
    storageDays: 3,
    storageEnv: 'fridge',
    imageDataUrl: '/recipes/salted-salmon.jpg',
    seeded: true,
    steps: [
      step(
        'Note: curing takes 2 days. Use pre-cut Japanese-style fillets, or cut a side of salmon into ~2.5 cm diagonal fillets (about 8 from a side).',
        undefined,
        'Before you start',
      ),
      step(
        'Sprinkle 15–30 ml sake over 600 g skin-on salmon fillets. Turn to coat. Rest 10 minutes, then pat dry with paper towels.',
        { duration: 10, unit: 'minutes' },
        'Salt',
      ),
      step(
        'Sprinkle salt on the skin first, then both sides (use 30 g — about 5% of the salmon’s weight). Press any leftover salt onto the skin.',
        undefined,
        'Salt',
      ),
      step(
        'Line an airtight container with paper towel. Layer salted fillets skin-side up with paper towels between layers. Cover and refrigerate 2 days.',
        { duration: 48, unit: 'hours' },
        'Cure',
      ),
      step(
        'After 2 days, discard wet paper towels. Fillets will be darker and firmer. Pat dry. Freeze individually or in pairs for up to 1 month if not cooking now.',
        undefined,
        'Cure',
      ),
      step(
        'Broil (recommended): rack ~23 cm from heat; preheat broiler on high 5 minutes. Oil a foil-lined tray; place salmon skin-side up. Broil 8–10 minutes until flaky — no flip.',
        { duration: 10, unit: 'minutes' },
        'Cook',
      ),
      step(
        'Or bake at 218°C / 425°F for 10–12 minutes, or grill ~5 minutes per side, until well done and flaky.',
        undefined,
        'Cook',
      ),
      step(
        'Grate ~5 cm daikon, squeeze gently, and serve beside the salmon with rice.',
        undefined,
        'Serve',
      ),
    ],
    ingredientNames: [
      { name: 'Salmon fillet', amount: 600 },
      { name: 'Salt', amount: 30 },
      { name: 'Sake', amount: 20 },
      { name: 'Daikon radish', amount: 50 },
    ],
  },
]

function assertUniqueSeedNames(): void {
  const ingNames = SEED_INGREDIENTS.map((i) => i.name.toLowerCase())
  const ingDupes = ingNames.filter((n, i) => ingNames.indexOf(n) !== i)
  if (ingDupes.length) {
    throw new Error(`Duplicate seed ingredient names: ${[...new Set(ingDupes)].join(', ')}`)
  }

  const recipeNames = SEED_RECIPE_DRAFTS.map((r) => r.name.toLowerCase())
  const recipeDupes = recipeNames.filter((n, i) => recipeNames.indexOf(n) !== i)
  if (recipeDupes.length) {
    throw new Error(`Duplicate seed recipe names: ${[...new Set(recipeDupes)].join(', ')}`)
  }

  const ingredientSet = new Set(ingNames)
  for (const draft of SEED_RECIPE_DRAFTS) {
    if (ingredientSet.has(draft.name.toLowerCase())) {
      throw new Error(
        `Seed recipe "${draft.name}" must not share a name with a pantry ingredient — use a distinct prep title.`,
      )
    }
  }
}

assertUniqueSeedNames()
