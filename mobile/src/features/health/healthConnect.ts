import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { todayISO, toISODate } from '@/features/common/date';

export type HealthStatus = 'unavailable' | 'needs-install' | 'ready' | 'denied' | 'connected';

export interface HealthSnapshot { steps: number | null; activeKcal: number | null; sleepHours: number | null; weightKg: number | null; weightDate: string | null }

interface Persisted { connected: boolean; lastSynced: string | null; lastWeightDate: string | null }
interface HealthState extends Persisted {
  status: HealthStatus; snapshot: HealthSnapshot | null; busy: boolean; error: string | null; loaded: boolean;
}

type HC = typeof import('react-native-health-connect');

const KEY = 'health.connect.v1';
const PERMS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'HeartRate' },
] as const;

/** The native module only exists in an Android dev/production build; everywhere else this returns null. */
function hc(): HC | null {
  // Health Connect needs Android 8 (API 26) or newer; the app itself supports Android 7.
  if (Platform.OS !== 'android' || Number(Platform.Version) < 26) return null;
  try { return require('react-native-health-connect'); } catch { return null; }
}

export const useHealthStore = create<HealthState>(() => ({
  status: 'unavailable', snapshot: null, busy: false, error: null, loaded: false, connected: false, lastSynced: null, lastWeightDate: null,
}));
const set = useHealthStore.setState;
const persist = () => {
  const { connected, lastSynced, lastWeightDate } = useHealthStore.getState();
  SecureStore.setItemAsync(KEY, JSON.stringify({ connected, lastSynced, lastWeightDate })).catch(() => {});
};

async function sdkStatus(m: HC): Promise<HealthStatus> {
  const s = await m.getSdkStatus();
  if (s === m.SdkAvailabilityStatus.SDK_AVAILABLE) return 'ready';
  if (s === m.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs-install';
  return 'unavailable';
}

async function hasAnyGranted(m: HC) {
  const granted = await m.getGrantedPermissions();
  return granted.some((g: any) => g.accessType === 'read');
}

export async function refreshHealth(): Promise<void> {
  const m = hc();
  if (!m) { set({ status: 'unavailable', loaded: true }); return; }
  try {
    if (!useHealthStore.getState().loaded) {
      const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
      if (raw) set(JSON.parse(raw) as Persisted);
    }
    let st = await sdkStatus(m);
    if (st === 'ready') {
      await m.initialize();
      if (useHealthStore.getState().connected) st = (await hasAnyGranted(m)) ? 'connected' : 'denied';
    }
    set({ status: st, loaded: true });
  } catch (e: any) {
    set({ status: 'unavailable', loaded: true, error: e?.message ?? null });
  }
}

export async function readSnapshot(m: HC): Promise<HealthSnapshot> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const now = new Date();
  const today = { operator: 'between' as const, startTime: start.toISOString(), endTime: now.toISOString() };
  const safe = async <T,>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };

  const steps = await safe(async () => (await m.aggregateRecord({ recordType: 'Steps', timeRangeFilter: today })).COUNT_TOTAL);
  const kcal = await safe(async () => (await m.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: today })).ACTIVE_CALORIES_TOTAL?.inKilocalories);
  const sleep = await safe(async () => {
    const from = new Date(now.getTime() - 36 * 3600_000).toISOString();
    const r = await m.readRecords('SleepSession', { timeRangeFilter: { operator: 'between', startTime: from, endTime: now.toISOString() } });
    const last = [...r.records].sort((a: any, b: any) => +new Date(b.endTime) - +new Date(a.endTime))[0] as any;
    return last ? (+new Date(last.endTime) - +new Date(last.startTime)) / 3600_000 : null;
  });
  const weight = await safe(async () => {
    const from = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const r = await m.readRecords('Weight', { timeRangeFilter: { operator: 'between', startTime: from, endTime: now.toISOString() } });
    const last = [...r.records].sort((a: any, b: any) => +new Date(b.time) - +new Date(a.time))[0] as any;
    if (!last) return null;
    const w = last.weight;
    const kg = w?.inKilograms ?? (w?.unit === 'kilograms' ? w.value : w?.unit === 'grams' ? w.value / 1000 : w?.unit === 'pounds' ? w.value * 0.45359237 : null);
    return kg ? { kg: Math.round(kg * 10) / 10, date: toISODate(new Date(last.time)) } : null;
  });
  return {
    steps: steps != null ? Math.round(steps) : null,
    activeKcal: kcal != null ? Math.round(kcal) : null,
    sleepHours: sleep != null && sleep > 0 ? Math.round(sleep * 10) / 10 : null,
    weightKg: weight?.kg ?? null, weightDate: weight?.date ?? null,
  };
}

/** Read from Health Connect and push to the existing endpoints. Read-only: nothing is ever written back to Health Connect. */
export async function syncHealth(): Promise<void> {
  const m = hc();
  if (!m || useHealthStore.getState().busy) return;
  set({ busy: true, error: null });
  try {
    const snap = await readSnapshot(m);
    const activity: Record<string, unknown> = { date: todayISO() };
    if (snap.steps != null) activity.steps = snap.steps;
    if (snap.sleepHours != null) activity.sleep_hours = Math.min(24, snap.sleepHours);
    if (Object.keys(activity).length > 1) await api('/v1/activity', { body: activity });
    let lastWeightDate = useHealthStore.getState().lastWeightDate;
    if (snap.weightKg != null && snap.weightDate && (!lastWeightDate || snap.weightDate > lastWeightDate) && snap.weightKg >= 25 && snap.weightKg <= 400) {
      await api('/v1/weight', { body: { weight_kg: snap.weightKg, log_date: snap.weightDate } });
      lastWeightDate = snap.weightDate;
    }
    set({ snapshot: snap, lastSynced: new Date().toISOString(), lastWeightDate, busy: false });
    persist();
  } catch (e: any) {
    set({ busy: false, error: e?.message ?? 'Sync failed' });
  }
}

export async function connectHealth(): Promise<void> {
  const m = hc();
  if (!m) return;
  set({ busy: true, error: null });
  try {
    await refreshHealth();
    const st = useHealthStore.getState().status;
    if (st === 'needs-install') { set({ busy: false }); m.openHealthConnectSettings(); return; }
    if (st === 'unavailable') { set({ busy: false }); return; }
    await m.requestPermission(PERMS as any);
    if (!(await hasAnyGranted(m))) { set({ busy: false, connected: false, status: 'denied' }); return; }
    set({ connected: true, status: 'connected', busy: false });
    persist();
    await syncHealth();
  } catch (e: any) {
    set({ busy: false, error: e?.message ?? 'Could not connect' });
  }
}

/** Stop using Health Connect in this app and revoke the permissions we were granted. Already-synced data is removed via Privacy & data. */
export async function disconnectHealth(): Promise<void> {
  const m = hc();
  try { await m?.revokeAllPermissions(); } catch { /* ignore */ }
  set({ connected: false, status: m ? 'ready' : 'unavailable', snapshot: null, lastSynced: null, lastWeightDate: null });
  persist();
}

export function openHealthConnectApp() { try { hc()?.openHealthConnectSettings(); } catch { /* ignore */ } }
