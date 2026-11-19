import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import { api } from '@/lib/api';
import { todayISO } from '@/features/common/date';

export interface StepState { steps: number | null; status: 'loading' | 'ok' | 'denied' | 'unavailable' }

/**
 * Today's steps from the device pedometer.
 * iOS can read the whole day's history; Android can only count from when the app starts listening, so we add that on top of
 * the last value stored on the server (`serverSteps`) and never report less than what's already saved.
 */
export function useSteps(enabled: boolean, serverSteps: number | null | undefined, serverReady: boolean): StepState {
  const [state, setState] = useState<StepState>({ steps: null, status: 'loading' });
  const base = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || !serverReady || started.current) return;
    started.current = true;
    base.current = serverSteps ?? 0;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) return setState({ steps: serverSteps ?? null, status: 'unavailable' });
        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted) return setState({ steps: serverSteps ?? null, status: 'denied' });
        if (Platform.OS === 'ios') {
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const r = await Pedometer.getStepCountAsync(start, new Date());
          if (cancelled) return;
          setState({ steps: r.steps, status: 'ok' });
          sub = Pedometer.watchStepCount((u) => setState({ steps: r.steps + u.steps, status: 'ok' }));
        } else {
          setState({ steps: base.current, status: 'ok' });
          sub = Pedometer.watchStepCount((u) => setState({ steps: base.current + u.steps, status: 'ok' }));
        }
      } catch {
        setState({ steps: serverSteps ?? null, status: 'unavailable' });
      }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [enabled, serverReady, serverSteps]);

  return state;
}

/** Push the step count to the server at most once a minute, only when it grew. */
export function useSyncSteps(steps: number | null, serverSteps: number | null | undefined, onSynced: () => void) {
  const last = useRef(0);
  useEffect(() => {
    if (steps === null || steps <= (serverSteps ?? 0)) return;
    const wait = Math.max(0, 60_000 - (Date.now() - last.current));
    const id = setTimeout(() => {
      last.current = Date.now();
      api('/v1/activity', { body: { date: todayISO(), steps } }).then(onSynced).catch(() => {});
    }, wait + 2000);
    return () => clearTimeout(id);
  }, [steps, serverSteps, onSynced]);
}
