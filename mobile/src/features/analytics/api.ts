import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { num, todayIso } from '@/features/settings/util';

export type Period = 'daily' | 'weekly' | 'monthly';
export interface Norm {
  labels: string[];
  calories: number[]; protein: number[]; carbs: number[]; fat: number[]; water: number[]; workouts: number[]; weight: (number | null)[];
  averages: Record<string, number>;
  adherence_pct: number | null; streak_days: number | null; target_kcal: number | null; target_water_ml: number | null;
  totals: Record<string, number>;
}

const SERIES = ['calories', 'protein', 'carbs', 'fat', 'water', 'workouts', 'weight'] as const;

/** Series elements may be plain numbers or {date,value} objects; this keeps the screen tolerant of either. */
function toNums(v: any): { values: (number | null)[]; labels: string[] } {
  if (!Array.isArray(v)) return { values: [], labels: [] };
  return {
    values: v.map((x) => (x == null ? null : typeof x === 'object' ? (x.value == null ? null : num(x.value)) : num(x))),
    labels: v.map((x) => (x && typeof x === 'object' ? String(x.date ?? x.label ?? '') : '')),
  };
}

export function normalize(r: any): Norm {
  const s = r?.series ?? {};
  const out: any = { averages: {}, totals: {} };
  let labels: string[] = Array.isArray(r?.labels) ? r.labels : Array.isArray(r?.dates) ? r.dates : Array.isArray(s?.labels) ? s.labels : [];
  SERIES.forEach((k) => {
    const raw = s[k] ?? r?.[k] ?? r?.[`${k}_series`];
    const { values, labels: l } = toNums(raw);
    out[k] = k === 'weight' ? values : values.map((x) => x ?? 0);
    if (!labels.length && l.some(Boolean)) labels = l;
  });
  Object.entries(r?.averages ?? {}).forEach(([k, v]) => { out.averages[k] = num(v); });
  Object.entries(r?.totals ?? {}).forEach(([k, v]) => { out.totals[k] = num(v); });
  const short = (l: string) => (/^\d{4}-\d{2}-\d{2}$/.test(l) ? `${parseInt(l.slice(8), 10)}/${parseInt(l.slice(5, 7), 10)}` : l);
  return {
    ...out, labels: labels.map(short),
    adherence_pct: r?.adherence_pct == null ? null : num(r.adherence_pct), streak_days: r?.streak_days == null ? null : num(r.streak_days),
    target_kcal: r?.targets?.kcal != null ? num(r.targets.kcal) : r?.target_kcal != null ? num(r.target_kcal) : null,
    target_water_ml: r?.targets?.water_ml != null ? num(r.targets.water_ml) : r?.target_water_ml != null ? num(r.target_water_ml) : null,
  } as Norm;
}

export function useAnalytics(period: Period) {
  return useQuery({
    queryKey: ['analytics', period],
    queryFn: async () => {
      const d = todayIso();
      const path = period === 'daily' ? `/v1/analytics/daily?date=${d}` : period === 'weekly' ? `/v1/analytics/weekly?end=${d}` : `/v1/analytics/monthly?month=${d.slice(0, 7)}`;
      return normalize(await api<any>(path));
    },
  });
}

export interface WeeklyReport { stats: Record<string, unknown>; summary: string; recommendations: string[] }
export function useWeeklyReport(enabled: boolean) {
  return useQuery({ queryKey: ['weekly-report', todayIso()], enabled, retry: false, staleTime: 30 * 60_000, queryFn: () => api<WeeklyReport>(`/v1/reports/weekly?end=${todayIso()}`) });
}
