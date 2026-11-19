import { create } from 'zustand';
import { api } from '@/lib/api';
import { todayIso } from '@/features/settings/util';
import { Exercise, FinishResult, PlanDay, PlanExercise, firstRep } from './api';

export interface SetRow { reps: number; weight_kg: number; done: boolean; skipped: boolean; is_pr: boolean; pending: boolean; failed: boolean }
export interface ExState { plan: PlanExercise; sets: SetRow[]; skipped: boolean }

interface SessionState {
  day: PlanDay | null;
  sessionId: string | null;
  startedAt: number;
  exercises: ExState[];
  index: number;
  result: FinishResult | null;
  startPromise: Promise<void> | null;
  begin: (day: PlanDay, resumeId?: string | null, bestWeights?: Record<string, number>) => Promise<void>;
  go: (i: number) => void;
  adjust: (ei: number, si: number, field: 'reps' | 'weight_kg', delta: number) => void;
  complete: (ei: number, si: number) => Promise<boolean>; // resolves true when the server flagged a PR
  skipExercise: (ei: number) => void;
  swapExercise: (ei: number, ex: Exercise) => void;
  retryFailed: () => Promise<number>; // returns how many are still failing
  finish: () => Promise<FinishResult>;
  reset: () => void;
}

const blankSet = (reps: number, w: number): SetRow => ({ reps, weight_kg: w, done: false, skipped: false, is_pr: false, pending: false, failed: false });

const setBody = (ex: Exercise, n: number, s: SetRow) => ({
  exercise_id: ex.id, set_number: n, reps: s.skipped ? 0 : s.reps, weight_kg: s.skipped ? 0 : s.weight_kg, completed: s.done && !s.skipped, skipped: s.skipped,
});

export const useSession = create<SessionState>((set, get) => {
  /** Posts one set; failures are kept in state (failed=true) and retried later, so no data is lost offline. */
  async function post(ei: number, si: number): Promise<boolean> {
    const st = get();
    const ex = st.exercises[ei]; const row = ex?.sets[si];
    if (!ex || !row || !st.sessionId) return false;
    const patch = (p: Partial<SetRow>) => set((s) => ({ exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, sets: e.sets.map((r, j) => (j === si ? { ...r, ...p } : r)) }) }));
    patch({ pending: true, failed: false });
    try {
      const r = await api<{ is_pr?: boolean }>(`/v1/workouts/sessions/${st.sessionId}/sets`, { body: setBody(ex.plan.exercise, si + 1, row) });
      patch({ pending: false, failed: false, is_pr: !!r?.is_pr });
      return !!r?.is_pr;
    } catch {
      patch({ pending: false, failed: true });
      return false;
    }
  }

  return {
    day: null, sessionId: null, startedAt: 0, exercises: [], index: 0, result: null, startPromise: null,

    begin: async (day, resumeId, bestWeights) => {
      const exercises: ExState[] = day.exercises.map((pe) => ({
        plan: pe, skipped: false,
        sets: Array.from({ length: Math.max(1, Number(pe.sets) || 3) }, () => blankSet(firstRep(pe.reps), bestWeights?.[pe.exercise.id] ?? 0)),
      }));
      set({ day, exercises, index: 0, result: null, startedAt: Date.now(), sessionId: null });
      let id = resumeId ?? null;
      if (!id) {
        const r = await api<any>('/v1/workouts/sessions', { body: { day_id: day.id, log_date: todayIso() } });
        id = r?.id ?? r?.session?.id ?? r?.session_id ?? null;
      }
      if (!id) throw new Error('Could not start the workout session.');
      set({ sessionId: id });
    },

    go: (i) => set((s) => ({ index: Math.max(0, Math.min(s.exercises.length - 1, i)) })),

    adjust: (ei, si, field, delta) => set((s) => ({
      exercises: s.exercises.map((e, i) => i !== ei ? e : {
        ...e, sets: e.sets.map((r, j) => {
          if (j !== si) return r;
          const v = field === 'reps' ? Math.max(0, Math.min(200, r.reps + delta)) : Math.max(0, Math.min(500, Math.round((r.weight_kg + delta) * 100) / 100));
          return { ...r, [field]: v, done: false, is_pr: false };
        }),
      }),
    })),

    complete: async (ei, si) => {
      const row = get().exercises[ei]?.sets[si];
      if (!row) return false;
      if (row.done) { // un-ticking only changes local state; the server keeps the last posted value
        set((s) => ({ exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, sets: e.sets.map((r, j) => (j === si ? { ...r, done: false, is_pr: false } : r)) }) }));
        return false;
      }
      set((s) => ({ exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, skipped: false, sets: e.sets.map((r, j) => (j === si ? { ...r, done: true, skipped: false } : r)) }) }));
      return post(ei, si);
    },

    skipExercise: (ei) => {
      set((s) => ({ exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, skipped: true, sets: e.sets.map((r) => (r.done ? r : { ...r, skipped: true })) }) }));
      const ex = get().exercises[ei];
      ex?.sets.forEach((r, si) => { if (r.skipped) post(ei, si); });
    },

    swapExercise: (ei, ex) => set((s) => ({
      exercises: s.exercises.map((e, i) => i !== ei ? e : { plan: { ...e.plan, exercise: ex }, skipped: false, sets: e.sets.map((r) => blankSet(r.reps, 0)) }),
    })),

    retryFailed: async () => {
      let still = 0;
      const jobs: Promise<boolean>[] = [];
      get().exercises.forEach((e, ei) => e.sets.forEach((r, si) => { if (r.failed) jobs.push(post(ei, si)); }));
      await Promise.all(jobs);
      get().exercises.forEach((e) => e.sets.forEach((r) => { if (r.failed) still++; }));
      return still;
    },

    finish: async () => {
      const id = get().sessionId;
      if (!id) throw new Error('No active session');
      const r = await api<FinishResult>(`/v1/workouts/sessions/${id}/finish`, { body: {} });
      set({ result: r });
      return r;
    },

    reset: () => set({ day: null, sessionId: null, exercises: [], index: 0, result: null, startedAt: 0 }),
  };
});

export const sessionProgress = (ex: ExState[]) => {
  const total = ex.reduce((a, e) => a + e.sets.length, 0);
  const done = ex.reduce((a, e) => a + e.sets.filter((s) => s.done || s.skipped).length, 0);
  return { total, done, pct: total ? done / total : 0, completed: ex.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0) };
};
