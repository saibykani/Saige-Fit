import { create } from 'zustand';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local-calendar YYYY-MM-DD (the API wants the user's local date, never UTC). */
export const isoDate = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoDate();

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
/** 1 = Monday … 7 = Sunday (the API's weekday convention). */
export const weekdayMon1 = (d: Date = new Date()) => ((d.getDay() + 6) % 7) + 1;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(iso: string): string {
  const d = parseIso(iso);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

export const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && isFinite(n) ? n : fallback;
};

/** Accepts `[...]`, `{key:[...]}` for any of the given keys, else []. Keeps screens tolerant of small shape differences. */
export function asArray<T>(r: any, ...keys: string[]): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object') for (const k of keys) if (Array.isArray(r[k])) return r[k] as T[];
  return [];
}

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function hhmm(t?: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}
export function fmtTime12(t?: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m ?? 0)} ${ap}`;
}

// ---------- units (display preference; the API always stores kg / cm) ----------
interface Prefs { units: 'metric' | 'imperial'; setUnits: (u: 'metric' | 'imperial') => void }
export const usePrefs = create<Prefs>((set) => ({ units: 'metric', setUnits: (units) => set({ units }) }));

export const KG_PER_LB = 0.45359237;
export function showWeight(kg: number, units: 'metric' | 'imperial', dec = 1): string {
  return units === 'metric' ? `${kg.toFixed(dec)} kg` : `${(kg / KG_PER_LB).toFixed(dec)} lb`;
}
export const weightUnit = (u: 'metric' | 'imperial') => (u === 'metric' ? 'kg' : 'lb');
export const displayWeight = (kg: number, u: 'metric' | 'imperial') => (u === 'metric' ? kg : kg / KG_PER_LB);
export const toKg = (v: number, u: 'metric' | 'imperial') => (u === 'metric' ? v : v * KG_PER_LB);
