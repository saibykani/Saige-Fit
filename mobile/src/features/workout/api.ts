import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { asArray, num, todayIso } from '@/features/settings/util';

export interface Exercise {
  id: string; name: string; muscle_group: string; secondary_muscles?: string[]; equipment: string[]; difficulty: string;
  instructions: string[]; common_mistakes: string[]; media_url?: string | null; alternatives?: Exercise[]; is_compound?: boolean;
}
export interface PlanExercise { exercise: Exercise; sets: number; reps: number | string; rest_s: number }
export interface PlanDay { id: string; weekday: number; focus: string; is_rest: boolean; exercises: PlanExercise[] }
export interface Plan { id: string; name: string; days: PlanDay[] }
export interface ActiveSession { id: string; started_at?: string; day_id?: string | null }

export interface WeekStat { week_start?: string; sessions?: number; volume_kg?: number; completion_pct?: number }
export interface Stats { weeks?: WeekStat[]; frequency?: number; completion_pct?: number; sessions_this_week?: number }
export interface PR { exercise_id?: string; exercise_name?: string; name?: string; weight_kg: number; reps?: number; achieved_on?: string }
export interface HistoryItem { id: string; log_date: string; started_at?: string; finished_at?: string | null; duration_min?: number; kcal_burned?: number | null; focus?: string; completion_pct?: number }
export interface FinishResult { duration_min: number; kcal_burned: number | null; completion_pct: number; new_prs: any[]; total_volume_kg?: number; sets_completed?: number }

export const PLAN_KEY = ['workout-plan'];

export function usePlan() {
  return useQuery({ queryKey: PLAN_KEY, queryFn: async () => (await api<{ plan: Plan | null }>('/v1/workouts/plan')).plan ?? null });
}
export function useToday() {
  const date = todayIso();
  return useQuery({ queryKey: ['workout-today', date], queryFn: () => api<{ day: PlanDay | null; session: ActiveSession | null }>(`/v1/workouts/today?date=${date}`) });
}
export function useStats(weeks = 8) {
  return useQuery({ queryKey: ['workout-stats', weeks], queryFn: () => api<Stats>(`/v1/workouts/stats?weeks=${weeks}`) });
}
export function usePrs() {
  return useQuery({ queryKey: ['workout-prs'], queryFn: async () => asArray<PR>(await api('/v1/workouts/prs'), 'prs', 'items') });
}
export function useHistory(limit = 40) {
  return useQuery({ queryKey: ['workout-history', limit], queryFn: async () => asArray<HistoryItem>(await api(`/v1/workouts/history?limit=${limit}`), 'sessions', 'items', 'history') });
}

export const prName = (p: PR) => p.exercise_name ?? p.name ?? 'Exercise';

/** Rough planned duration from the plan itself (sets x ~45s work + rest). Shown with a "~". */
export function estMinutes(d: PlanDay): number {
  const s = d.exercises.reduce((a, e) => a + num(e.sets, 3) * (45 + num(e.rest_s, 60)), 0);
  return Math.max(5, Math.round(s / 60));
}
export const firstRep = (reps: number | string): number => {
  const n = parseInt(String(reps), 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
};
export const repsLabel = (reps: number | string) => String(reps);

// ---- history hints, quick workouts and the weekly overview (backend: workout_extras) ----
export interface Suggestion { action: 'start' | 'increase' | 'repeat' | 'add_reps'; weight_kg: number | null; reps: number | null; reason: string }
export interface ExerciseHistory {
  exercise_id: string; name: string;
  sessions: { session_id: string; date: string; sets: { set_number: number; reps: number; weight_kg: number; is_pr: boolean }[]; top_e1rm: number; volume_kg: number }[];
  best: { weight_kg: number; reps: number; e1rm: number; achieved_on: string } | null;
  e1rm: number | null; suggestion: Suggestion; warmup: { weight_kg: number; reps: number }[];
}
export interface MuscleVolume { muscle_group: string; sets: number; prev_sets: number; volume_kg: number }
export interface Overview {
  week_start: string; muscles: MuscleVolume[]; sessions_this_week: number; planned_sessions: number;
  streak: { current: number; longest: number };
  last_pr: { name: string | null; weight_kg: number; reps: number; e1rm: number; achieved_on: string } | null;
}
export const QUICK_MUSCLES = ['full', 'chest', 'back', 'shoulders', 'legs', 'arms', 'core', 'push', 'pull'] as const;

export function useExerciseHistory(id: string | undefined, enabled = true) {
  return useQuery({ queryKey: ['ex-history', id], enabled: !!id && id !== 'quick' && enabled, staleTime: 60_000,
    queryFn: () => api<ExerciseHistory>(`/v1/workouts/exercises/${id}/history?limit=3`) });
}
export function useOverview() {
  const date = todayIso();
  return useQuery({ queryKey: ['workout-overview', date], queryFn: () => api<Overview>(`/v1/workouts/overview?today=${date}`) });
}
