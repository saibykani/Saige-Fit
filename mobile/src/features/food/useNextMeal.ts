import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type NextMealSuggestion = {
  kind: 'recipe' | 'food'; id: string; name: string; serving: string;
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; reason: string;
};
export type NextMeal = {
  date: string; slot: string; message: string | null; suggestions: NextMealSuggestion[];
  remaining: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
};

/** Deterministic suggestions for what fits the rest of today. Key starts with 'journal' so logging a meal refreshes it. */
export function useNextMeal(day: string) {
  return useQuery({
    queryKey: ['journal', 'next-meal', day],
    queryFn: () => api<NextMeal>(`/v1/suggestions/next-meal?date=${day}&hour=${new Date().getHours()}`),
    staleTime: 60_000,
  });
}
