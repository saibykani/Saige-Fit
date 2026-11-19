import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { asArray, num } from '@/features/settings/util';

export interface Alt { name: string; kcal?: number; protein_g?: number; quantity_g?: number }
export interface PlanMeal {
  id: string; meal_type: string; name: string; quantity_g?: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
  instructions?: string | null; alternatives?: (Alt | string)[]; scheduled_time?: string | null;
}
export interface DayPlan { plan_id: string | null; date: string; meals: PlanMeal[] }
export interface Rec { name: string; grams?: number; kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number; reason?: string; food_id?: string }
export interface Recs { recommendations: Rec[]; summary?: string }

export const MEAL_ORDER = ['early_morning', 'breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner', 'snack'];
export const MEAL_LABEL: Record<string, string> = {
  early_morning: 'Early morning', breakfast: 'Breakfast', mid_morning: 'Mid-morning snack', lunch: 'Lunch', evening_snack: 'Evening snack', dinner: 'Dinner', snack: 'Snack',
};
export const MEAL_ICON: Record<string, string> = {
  early_morning: 'partly-sunny-outline', breakfast: 'cafe-outline', mid_morning: 'nutrition-outline', lunch: 'restaurant-outline', evening_snack: 'ice-cream-outline', dinner: 'moon-outline', snack: 'nutrition-outline',
};

/** Accepts a flat `meals` array, `{type:[...]}` map, or `[{meal_type, items}]` groups. */
export function normalizeMeals(r: any): PlanMeal[] {
  const raw = r?.meals ?? r?.groups ?? r?.items ?? [];
  const fix = (m: any, type?: string): PlanMeal => ({
    ...m, meal_type: m.meal_type ?? type ?? 'snack', kcal: num(m.kcal), protein_g: num(m.protein_g), carbs_g: num(m.carbs_g), fat_g: num(m.fat_g),
  });
  if (Array.isArray(raw)) {
    return raw.flatMap((x: any) => {
      const inner = x?.items ?? x?.meals;
      return Array.isArray(inner) ? inner.map((m: any) => fix(m, x.meal_type)) : [fix(x)];
    });
  }
  if (raw && typeof raw === 'object') return Object.entries(raw).flatMap(([type, arr]) => (Array.isArray(arr) ? arr : []).map((m: any) => fix(m, type)));
  return [];
}

export function groupMeals(meals: PlanMeal[]): { type: string; meals: PlanMeal[] }[] {
  const by: Record<string, PlanMeal[]> = {};
  meals.forEach((m) => { (by[m.meal_type] ??= []).push(m); });
  return Object.keys(by).sort((a, b) => MEAL_ORDER.indexOf(a) - MEAL_ORDER.indexOf(b)).map((type) => ({ type, meals: by[type] }));
}

export const sumMeals = (meals: PlanMeal[]) => meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.protein_g, c: a.c + m.carbs_g, f: a.f + m.fat_g }), { kcal: 0, p: 0, c: 0, f: 0 });

export const altName = (a: Alt | string) => (typeof a === 'string' ? a : a.name);

export function useDayPlan(date: string) {
  return useQuery({
    queryKey: ['diet-plan', date],
    queryFn: async (): Promise<DayPlan> => {
      try {
        const r = await api<any>(`/v1/diet/plan?date=${date}`);
        return { plan_id: r?.plan_id ?? r?.plan?.id ?? null, date, meals: normalizeMeals(r) };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { plan_id: null, date, meals: [] }; // no plan for that day yet
        throw e;
      }
    },
  });
}

export function useRecs(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['diet-recs', date],
    enabled,
    retry: false,
    queryFn: async (): Promise<Recs> => {
      const r = await api<any>(`/v1/diet/recommendations?date=${date}&hour=${new Date().getHours()}`);
      return { recommendations: asArray<Rec>(r, 'recommendations', 'items', 'suggestions'), summary: r?.summary ?? r?.reason };
    },
  });
}
