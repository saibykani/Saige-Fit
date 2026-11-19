import { create } from 'zustand';
import { FoodSummary, Macros, MealType, mealForNow, per100Of } from '@/features/common/types';

export interface ScanApiItem {
  detected_name: string; grams: number; confidence: number; cooking_method: string | null; is_estimate: boolean;
  needs_confirmation: boolean; food_id: string | null; name: string;
  nutrition: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number | null } | null;
  allergen_warnings: string[];
}
export interface ScanResponse { scan_id: string; items: ScanApiItem[]; disclaimer: string; empty: boolean }

/** Editable meal line. Macros are always derived live from per100 x grams, never typed in. */
export interface ScanItem {
  key: string;
  detectedName: string;
  name: string;
  foodId: string | null;
  grams: number;
  per100: Macros | null;
  confidence: number;
  cooking: string | null;
  needsConfirmation: boolean;
  confirmed: boolean;
  edited: boolean;
  allergens: string[];
}

let seq = 0;
export const newKey = () => `i${Date.now().toString(36)}${seq++}`;

export function fromApi(i: ScanApiItem): ScanItem {
  const k = i.nutrition && i.grams > 0 ? 100 / i.grams : 0;
  const n = i.nutrition;
  return {
    key: newKey(), detectedName: i.detected_name, name: i.name, foodId: i.food_id, grams: Math.round(i.grams),
    per100: n ? { kcal: n.kcal * k, protein_g: n.protein_g * k, carbs_g: n.carbs_g * k, fat_g: n.fat_g * k, fiber_g: (n.fiber_g ?? 0) * k } : null,
    confidence: i.confidence, cooking: i.cooking_method, needsConfirmation: i.needs_confirmation || !i.food_id,
    confirmed: false, edited: false, allergens: i.allergen_warnings ?? [],
  };
}

export function fromFood(food: FoodSummary, grams: number): ScanItem {
  return {
    key: newKey(), detectedName: food.name, name: food.name, foodId: food.id ?? null, grams, per100: per100Of(food),
    confidence: 1, cooking: null, needsConfirmation: false, confirmed: true, edited: true, allergens: food.allergens ?? [],
  };
}

interface ScanState {
  imageUri: string | null;
  scanId: string | null;
  disclaimer: string;
  items: ScanItem[];
  mealType: MealType;
  setResult: (uri: string, r: ScanResponse) => void;
  patchItem: (key: string, patch: Partial<ScanItem>) => void;
  removeItem: (key: string) => void;
  addItem: (i: ScanItem) => void;
  replaceFood: (key: string, food: FoodSummary, grams: number) => void;
  setMealType: (m: MealType) => void;
  reset: () => void;
}

export const useScan = create<ScanState>((set) => ({
  imageUri: null, scanId: null, disclaimer: '', items: [], mealType: mealForNow(),
  setResult: (imageUri, r) => set({ imageUri, scanId: r.scan_id, disclaimer: r.disclaimer, items: r.items.map(fromApi), mealType: mealForNow() }),
  patchItem: (key, patch) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) })),
  removeItem: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  replaceFood: (key, food, grams) => set((s) => ({
    items: s.items.map((i) => (i.key === key
      ? { ...i, name: food.name, foodId: food.id ?? null, per100: per100Of(food), grams, confirmed: true, edited: true, needsConfirmation: false, allergens: food.allergens ?? [] }
      : i)),
  })),
  setMealType: (mealType) => set({ mealType }),
  reset: () => set({ imageUri: null, scanId: null, disclaimer: '', items: [], mealType: mealForNow() }),
}));
