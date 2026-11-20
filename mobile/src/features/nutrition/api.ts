import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { useInvalidateDay } from '@/features/common/hooks';
import type { MealType } from '@/features/common/types';

export interface SubScore { key: string; label: string; score: number | null; weight: number; detail: string }
export interface Insight { key: string; severity: 'good' | 'info' | 'warn'; title: string; body: string }
export interface NutritionInsights {
  date: string; logged: boolean; score: number | null; grade: string; subscores: SubScore[]; insights: Insight[];
  consumed: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  targets: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  water_ml: number; water_target_ml: number;
  trend: { date: string; score: number | null; kcal: number | null }[]; trend_avg: number | null;
}

/** Key starts with 'journal' so logging or deleting a meal (useInvalidateDay) refreshes the score too. */
export function useNutritionInsights(day: string) {
  return useQuery({
    queryKey: ['journal', 'nutrition', day],
    queryFn: () => api<NutritionInsights>(`/v1/nutrition/insights?date=${day}&hour=${new Date().getHours()}`),
    retry: (n, e) => !(e instanceof ApiError && [401, 409].includes(e.status)) && n < 1,
  });
}

export interface FrequentFood {
  food_id: string; name: string; times: number; default_quantity_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
}
export interface FrequentMeal { meal_type: MealType; name: string; times: number; items: { food_id: string; name: string; quantity_g: number }[]; kcal: number; protein_g: number }

export function useFrequent() {
  return useQuery({
    queryKey: ['journal', 'frequent'],
    queryFn: () => api<{ foods: FrequentFood[]; meals: FrequentMeal[] }>('/v1/meals/frequent?limit=8'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export interface CopyResult { copied: number; meal_ids: string[]; skipped_meal_types: MealType[]; kcal: number }
export function useCopyDay() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: (v: { from_date: string; to_date: string; meal_types?: MealType[] }) => api<CopyResult>('/v1/meals/copy', { body: v }),
    onSuccess: () => invalidate(),
  });
}

export function useLogSuggestion() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: (v: { kind: 'food' | 'recipe'; id: string; meal_type: MealType; log_date: string; servings?: number }) =>
      api<{ meal_id: string }>('/v1/meals/log-suggestion', { body: v }),
    onSuccess: () => invalidate(),
  });
}

/** Meal slot that fits the current time of day. */
export function mealForNow(h = new Date().getHours()): MealType {
  return h < 7 ? 'early_morning' : h < 10 ? 'breakfast' : h < 12 ? 'mid_morning' : h < 16 ? 'lunch' : h < 19 ? 'evening_snack' : 'dinner';
}
