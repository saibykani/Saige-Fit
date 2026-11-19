import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { signedUrl } from '@/lib/upload';
import { asArray, num } from '@/features/settings/util';

export interface WeightPoint { id?: string; log_date: string; weight_kg: number }
export interface WeightData { points: WeightPoint[]; trend: (number | null)[] }
export interface Summary {
  start_weight: number | null; current_weight: number | null; target_weight: number | null; goal_pct: number | null;
  change_kg: number | null; weekly_change_kg: number | null; bmi: number | null; measurements_delta?: Record<string, number | null>; photos_count?: number;
}
export interface Measurement { id?: string; log_date: string; waist_cm?: number | null; chest_cm?: number | null; arm_cm?: number | null; hip_cm?: number | null; thigh_cm?: number | null; body_fat_pct?: number | null }
export interface Photo { id: string; image_path: string; angle?: string | null; taken_on: string; signed_url?: string | null }

export const MEASURES: { key: keyof Measurement; label: string; unit: string }[] = [
  { key: 'waist_cm', label: 'Waist', unit: 'cm' }, { key: 'chest_cm', label: 'Chest', unit: 'cm' }, { key: 'arm_cm', label: 'Arm', unit: 'cm' },
  { key: 'hip_cm', label: 'Hips', unit: 'cm' }, { key: 'thigh_cm', label: 'Thigh', unit: 'cm' }, { key: 'body_fat_pct', label: 'Body fat (measured)', unit: '%' },
];

export function useWeight(days: number) {
  return useQuery({
    queryKey: ['weight', days],
    queryFn: async (): Promise<WeightData> => {
      const r = await api<any>(`/v1/weight?days=${days}`);
      const points = asArray<WeightPoint>(r, 'points').map((p) => ({ ...p, weight_kg: num(p.weight_kg) }));
      const raw = r?.trend_7d_avg;
      const trend = Array.isArray(raw) ? raw.map((v: any) => (v == null ? null : num(typeof v === 'object' ? v.value ?? v.weight_kg : v))) : [];
      return { points, trend };
    },
  });
}
export const useSummary = (range: number) => useQuery({ queryKey: ['progress-summary', range], queryFn: () => api<Summary>(`/v1/progress/summary?range=${range}`) });
export const useMeasurements = () => useQuery({
  queryKey: ['measurements'],
  queryFn: async () => asArray<Measurement>(await api('/v1/measurements'), 'items', 'measurements').sort((a, b) => a.log_date.localeCompare(b.log_date)),
});
export const usePhotos = () => useQuery({
  queryKey: ['progress-photos'],
  queryFn: async (): Promise<Photo[]> => {
    const rows = asArray<Photo>(await api('/v1/progress/photos'), 'photos', 'items').sort((a, b) => a.taken_on.localeCompare(b.taken_on));
    return Promise.all(rows.map(async (p) => (p.signed_url ? p : { ...p, signed_url: await signedUrl('progress-photos', p.image_path) })));
  },
  staleTime: 10 * 60_000, // signed URLs are short-lived; refresh periodically
});
