import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { useInvalidateDay } from '@/features/common/hooks';
import type { MealType } from '@/features/common/types';

export interface Dashboard {
  date: string;
  targets: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  consumed: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null };
  remaining_kcal: number;
  remaining: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  water_ml: number;
  water_target_ml: number;
  meals: { id: string; meal_type: MealType; kcal: number }[];
  insights: string[];
  activity?: { steps?: number | null; workout_minutes?: number | null; sleep_hours?: number | null; active_kcal?: number | null };
  meal_slots?: { meal_type: MealType; planned?: { name: string; kcal?: number } | null; logged_kcal?: number }[];
}

export function useDashboard(day: string) {
  return useQuery({
    queryKey: ['dashboard', day],
    queryFn: () => api<Dashboard>(`/v1/dashboard?date=${day}&hour=${new Date().getHours()}`),
    retry: (n, e) => !(e instanceof ApiError && [401, 409].includes(e.status)) && n < 1,
  });
}

export interface WorkoutToday {
  day?: { id?: string; focus?: string; is_rest?: boolean; exercises?: unknown[] } | null;
  session?: { id: string; finished_at?: string | null } | null;
}

/** Optional card: if the user has no plan / plan is gated, the query errors and the UI simply hides it. */
export function useWorkoutToday(day: string) {
  return useQuery({ queryKey: ['workout-today', day], queryFn: () => api<WorkoutToday>(`/v1/workouts/today?date=${day}`), retry: false });
}

export function useQuickWater(day: string) {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: (amount_ml: number) => api('/v1/hydration', { body: { amount_ml, beverage: 'water', counts_toward_goal: true, log_date: day } }),
    onSuccess: () => invalidate(),
  });
}

export function useLogActivity(day: string) {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: (v: { steps?: number; sleep_hours?: number }) => api('/v1/activity', { body: { date: day, ...v } }),
    onSuccess: () => invalidate(),
  });
}
