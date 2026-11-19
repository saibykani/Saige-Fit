import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { signedUrl } from '@/lib/upload';
import { useInvalidateDay } from '@/features/common/hooks';
import { FoodSummary, JournalMeal, MealType, unwrapList } from '@/features/common/types';

export function useJournal(day: string) {
  return useQuery({
    queryKey: ['journal', day],
    queryFn: async () => unwrapList<JournalMeal>(await api<unknown>(`/v1/meals?date=${day}`), ['meals']),
  });
}

export function useDeleteMeal() {
  const invalidate = useInvalidateDay();
  return useMutation({ mutationFn: (id: string) => api(`/v1/meals/${id}`, { method: 'DELETE' }), onSuccess: () => invalidate() });
}

export function useUpdateItem() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: (v: { mealId: string; itemId: string; quantity_g: number }) =>
      api(`/v1/meals/${v.mealId}/items/${v.itemId}`, { method: 'PATCH', body: { quantity_g: v.quantity_g } }),
    onSuccess: () => invalidate(),
  });
}

export function useFoodSearch(q: string) {
  return useQuery({
    queryKey: ['food-search', q],
    queryFn: async () => unwrapList<FoodSummary>(await api<unknown>(`/v1/foods/search?q=${encodeURIComponent(q)}`)),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });
}

/** USDA FoodData Central proxy; only runs when the user asks for it (`enabled`). */
export function useUsdaSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['usda-search', q],
    queryFn: async () => unwrapList<FoodSummary>(await api<unknown>(`/v1/foods/usda?q=${encodeURIComponent(q)}`)),
    enabled: enabled && q.trim().length >= 2,
    retry: false,
  });
}

export async function importUsdaFood(fdc_id: number | string): Promise<FoodSummary> {
  const res = await api<{ food?: FoodSummary } & FoodSummary>('/v1/foods/usda/import', { body: { fdc_id } });
  return res.food ?? res;
}

export function useRecentFoods() {
  return useQuery({ queryKey: ['recent-foods'], queryFn: async () => unwrapList<FoodSummary>(await api<unknown>('/v1/foods/recent')) });
}

export function useFavoriteFoods() {
  return useQuery({
    queryKey: ['favorite-foods'],
    queryFn: async () => unwrapList<FoodSummary & { food?: FoodSummary }>(await api<unknown>('/v1/favorites/foods')).map((f) => f.food ?? f),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on ? api('/v1/favorites/foods', { body: { food_id: id } }) : api(`/v1/favorites/foods/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorite-foods'] }),
  });
}

export interface CustomFoodInput {
  name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
  sat_fat_g?: number; fiber_g?: number; sugar_g?: number; sodium_mg?: number; default_serving_g?: number;
}
export async function createCustomFood(v: CustomFoodInput): Promise<FoodSummary> {
  const res = await api<{ food?: FoodSummary } & FoodSummary>('/v1/foods', { body: v });
  return res.food ?? res;
}

export interface LogMealInput {
  meal_type: MealType; log_date: string; items: { food_id: string; quantity_g: number; user_edited?: boolean }[];
  scan_id?: string; photo_path?: string; is_estimate?: boolean;
}
export function useLogMeal() {
  const invalidate = useInvalidateDay();
  return useMutation({ mutationFn: (v: LogMealInput) => api<{ meal_id: string }>('/v1/meals', { body: v }), onSuccess: () => invalidate() });
}

export function usePhotoUrl(path: string | null | undefined) {
  return useQuery({ queryKey: ['photo', path], queryFn: () => signedUrl('food-photos', path as string), enabled: !!path, staleTime: 30 * 60_000 });
}
