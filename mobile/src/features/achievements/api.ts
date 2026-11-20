import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { todayIso } from '@/features/settings/util';

export interface Streak { current: number; longest: number }
export interface Badge { key: string; title: string; description: string; earned: boolean; progress: number; goal: number }
export interface StreaksData {
  streaks: { logging: Streak; workout: Streak; water: Streak };
  totals: { workouts: number; scans: number };
  badges: Badge[];
}

export function useStreaks() {
  return useQuery({ queryKey: ['streaks'], queryFn: () => api<StreaksData>(`/v1/streaks?today=${todayIso()}`) });
}
