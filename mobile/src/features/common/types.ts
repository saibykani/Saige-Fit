export type MealType = 'early_morning' | 'breakfast' | 'mid_morning' | 'lunch' | 'evening_snack' | 'dinner' | 'snack';

export const MEAL_ORDER: MealType[] = ['early_morning', 'breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner', 'snack'];
export const MEAL_LABELS: Record<MealType, string> = {
  early_morning: 'Early morning', breakfast: 'Breakfast', mid_morning: 'Morning snack', lunch: 'Lunch',
  evening_snack: 'Evening snack', dinner: 'Dinner', snack: 'Snack',
};
export const MEAL_ICONS: Record<MealType, 'sunny-outline' | 'cafe-outline' | 'nutrition-outline' | 'restaurant-outline' | 'fast-food-outline' | 'moon-outline' | 'ice-cream-outline'> = {
  early_morning: 'sunny-outline', breakfast: 'cafe-outline', mid_morning: 'nutrition-outline', lunch: 'restaurant-outline',
  evening_snack: 'fast-food-outline', dinner: 'moon-outline', snack: 'ice-cream-outline',
};

/** Pick a sensible default meal slot from the local clock. */
export function mealForNow(d = new Date()): MealType {
  const h = d.getHours();
  if (h < 7) return 'early_morning';
  if (h < 10) return 'breakfast';
  if (h < 12) return 'mid_morning';
  if (h < 15) return 'lunch';
  if (h < 18) return 'evening_snack';
  if (h < 22) return 'dinner';
  return 'snack';
}

export interface NutritionRow {
  kcal: number; protein_g: number; carbs_g: number; fat_g: number;
  sat_fat_g?: number | null; fiber_g?: number | null; sugar_g?: number | null; sodium_mg?: number | null;
}

export interface Macros { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }

export interface FoodSummary {
  id?: string;
  fdc_id?: number | string;
  name: string;
  brand?: string | null;
  serving_label?: string | null;
  grams_per_unit?: number | null;
  default_serving_g?: number | null;
  allergens?: string[];
  diet_tags?: string[];
  food_nutrition?: NutritionRow | NutritionRow[] | null;
  nutrition?: NutritionRow | null;
}

const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

/** Per-100 g macros of a food record (tolerates object or one-element array embeds). */
export function per100Of(f: FoodSummary): Macros {
  const raw = f.food_nutrition ?? f.nutrition ?? null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return { kcal: n(row?.kcal), protein_g: n(row?.protein_g), carbs_g: n(row?.carbs_g), fat_g: n(row?.fat_g), fiber_g: n(row?.fiber_g) };
}

export function scaleMacros(p: Macros, grams: number): Macros {
  const k = grams / 100;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return { kcal: Math.round(p.kcal * k), protein_g: r(p.protein_g), carbs_g: r(p.carbs_g), fat_g: r(p.fat_g), fiber_g: r(p.fiber_g) };
}

export function sumMacros(list: Macros[]): Macros {
  const t = list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein_g: a.protein_g + m.protein_g, carbs_g: a.carbs_g + m.carbs_g, fat_g: a.fat_g + m.fat_g, fiber_g: a.fiber_g + m.fiber_g }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  const r = (v: number) => Math.round(v * 10) / 10;
  return { kcal: Math.round(t.kcal), protein_g: r(t.protein_g), carbs_g: r(t.carbs_g), fat_g: r(t.fat_g), fiber_g: r(t.fiber_g) };
}

/** APIs sometimes return `[...]` and sometimes `{items:[...]}`; accept both. */
export function unwrapList<T>(v: unknown, keys: string[] = ['items']): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') {
    for (const k of keys) {
      const x = (v as Record<string, unknown>)[k];
      if (Array.isArray(x)) return x as T[];
    }
  }
  return [];
}

export interface MealItem {
  id: string; meal_id?: string; food_id: string | null; name: string; quantity_g: number;
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number | null;
  is_estimate?: boolean; user_edited?: boolean;
}
export interface JournalMeal {
  id: string; meal_type: MealType; eaten_at?: string; photo_path?: string | null;
  items: MealItem[]; total?: Macros;
}
