import type { Store } from './types';

// Demo data lives on the device only: localStorage on web, memory elsewhere (resets on app restart).
const mem = new Map<string, string>();
const PREFIX = 'saigefit.demo.';
const ls = (): Storage | null => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };

export const store: Store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = ls()?.getItem(PREFIX + key) ?? mem.get(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch { return fallback; }
  },
  set<T>(key: string, value: T) {
    const raw = JSON.stringify(value);
    mem.set(key, raw);
    try { ls()?.setItem(PREFIX + key, raw); } catch { /* ignore quota/private mode */ }
  },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const today = () => new Date().toISOString().slice(0, 10);
