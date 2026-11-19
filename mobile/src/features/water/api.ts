import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInvalidateDay } from '@/features/common/hooks';
import { addDays, toISODate, unwrapList } from '@/features/common/types-date';

export interface HydrationLog { id: string; amount_ml: number; beverage: string; counts_toward_goal: boolean; logged_at: string }
export interface HydrationDay { target_ml: number; total_ml: number; water_ml: number; logs: HydrationLog[] }

export const BEVERAGES: { value: string; label: string; counts: boolean }[] = [
  { value: 'water', label: 'Water', counts: true },
  { value: 'tea', label: 'Tea', counts: false },
  { value: 'coffee', label: 'Coffee', counts: false },
  { value: 'juice', label: 'Juice', counts: false },
  { value: 'milk', label: 'Milk', counts: false },
  { value: 'soft_drink', label: 'Soft drink', counts: false },
  { value: 'other', label: 'Other', counts: false },
];

export function useHydration(day: string) {
  return useQuery({ queryKey: ['hydration', day], queryFn: () => api<HydrationDay>(`/v1/hydration?date=${day}`) });
}

export function useAddDrink(day: string) {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: (v: { amount_ml: number; beverage: string; counts_toward_goal: boolean }) => api('/v1/hydration', { body: { ...v, log_date: day } }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteDrink() {
  const invalidate = useInvalidateDay();
  return useMutation({ mutationFn: (id: string) => api(`/v1/hydration/${id}`, { method: 'DELETE' }), onSuccess: () => invalidate() });
}

export function useSetWaterTarget() {
  const invalidate = useInvalidateDay();
  return useMutation({ mutationFn: (target_ml: number) => api('/v1/hydration/target', { method: 'PUT', body: { target_ml } }), onSuccess: () => invalidate() });
}

export interface HistoryDay { date: string; ml: number }

/** Last `days` days ending today. Days without any logs are 0 ml (that is the truth, not a made-up value). */
export function useHydrationHistory(days = 14) {
  return useQuery({
    queryKey: ['hydration', 'history', days],
    queryFn: async (): Promise<{ points: HistoryDay[]; target: number | null }> => {
      const raw = await api<unknown>(`/v1/hydration/history?days=${days}`);
      const rows = unwrapList<Record<string, unknown>>(raw, ['days', 'items', 'history', 'points']);
      const byDate = new Map<string, number>();
      for (const r of rows) {
        const d = String(r.date ?? r.log_date ?? '');
        const v = Number(r.water_ml ?? r.total_ml ?? r.ml ?? 0);
        if (d) byDate.set(d.slice(0, 10), v);
      }
      const points = Array.from({ length: days }, (_, i) => {
        const date = toISODate(addDays(new Date(), i - (days - 1)));
        return { date, ml: byDate.get(date) ?? 0 };
      });
      const target = raw && typeof raw === 'object' && !Array.isArray(raw) ? Number((raw as Record<string, unknown>).target_ml) || null : null;
      return { points, target };
    },
  });
}
