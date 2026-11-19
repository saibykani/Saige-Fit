import { num } from '@/features/settings/util';

export interface Ingredient { name: string; grams?: number; quantity_g?: number; food_id?: string }
export interface Recipe {
  id: string; name: string; description?: string | null; servings?: number; prep_minutes?: number | null; diet_tags?: string[];
  ingredients?: Ingredient[]; steps?: string[]; is_favorite?: boolean;
  nutrition?: { kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fiber_g?: number };
  kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number;
}

// Per-serving values may be nested under `nutrition` or flat on the recipe.
export const recipeKcal = (r: Recipe) => num(r.nutrition?.kcal ?? r.kcal);
export const recipeProtein = (r: Recipe) => num(r.nutrition?.protein_g ?? r.protein_g);
export const recipeCarbs = (r: Recipe) => num(r.nutrition?.carbs_g ?? r.carbs_g);
export const recipeFat = (r: Recipe) => num(r.nutrition?.fat_g ?? r.fat_g);
