import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { create } from 'zustand';
import { clampHours, type FastRecord } from './logic';

// AsyncStorage is not installed: use localStorage on web and a JSON file (expo-file-system) on native.
const KEY = 'saige-fasting-v1';
const file = () => `${FileSystem.documentDirectory ?? ''}${KEY}.json`;

async function load(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    const info = await FileSystem.getInfoAsync(file());
    return info.exists ? await FileSystem.readAsStringAsync(file()) : null;
  } catch { return null; }
}
async function save(v: string): Promise<void> {
  try {
    if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.localStorage.setItem(KEY, v); return; }
    await FileSystem.writeAsStringAsync(file(), v);
  } catch { /* persistence is best-effort */ }
}

interface FastingState {
  ready: boolean;
  goalHours: number;
  active: { startedAt: number; goalHours: number } | null;
  history: FastRecord[]; // newest first, max 14
  hydrate: () => Promise<void>;
  setGoal: (h: number) => void;
  start: (now?: number) => void;
  stop: (now?: number) => void; // ends the fast (early or complete) and records it
}

const persist = (s: FastingState) =>
  save(JSON.stringify({ goalHours: s.goalHours, active: s.active, history: s.history }));

export const useFasting = create<FastingState>((set, get) => ({
  ready: false,
  goalHours: 16,
  active: null,
  history: [],
  hydrate: async () => {
    const raw = await load();
    if (raw) {
      try {
        const d = JSON.parse(raw);
        set({
          goalHours: clampHours(d.goalHours), active: d.active ?? null,
          history: Array.isArray(d.history) ? d.history.slice(0, 14) : [],
        });
      } catch { /* ignore corrupt data */ }
    }
    set({ ready: true });
  },
  setGoal: (h) => { if (get().active) return; set({ goalHours: clampHours(h) }); void persist(get()); },
  start: (now = Date.now()) => {
    if (get().active) return;
    set({ active: { startedAt: now, goalHours: get().goalHours } }); void persist(get());
  },
  stop: (now = Date.now()) => {
    const a = get().active;
    if (!a) return;
    const rec: FastRecord = { id: String(a.startedAt), startedAt: a.startedAt, endedAt: now, goalHours: a.goalHours };
    set({ active: null, history: [rec, ...get().history].slice(0, 14) }); void persist(get());
  },
}));
