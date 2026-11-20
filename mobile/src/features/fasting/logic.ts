// Pure helpers for the fasting timer. No React, no I/O, so they are easy to unit test.

export const HOUR_MS = 3_600_000;

export interface Preset { id: string; label: string; hours: number }
export const PRESETS: Preset[] = [
  { id: '16:8', label: '16:8', hours: 16 },
  { id: '18:6', label: '18:6', hours: 18 },
  { id: '20:4', label: '20:4', hours: 20 },
];

export const MIN_HOURS = 1;
export const MAX_HOURS = 72;

export interface FastRecord { id: string; startedAt: number; endedAt: number; goalHours: number }

export function clampHours(h: number): number {
  if (!Number.isFinite(h)) return 16;
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(h * 10) / 10));
}

export function elapsedMs(startedAt: number, now: number): number { return Math.max(0, now - startedAt); }
export function remainingMs(startedAt: number, goalHours: number, now: number): number {
  return Math.max(0, goalHours * HOUR_MS - elapsedMs(startedAt, now));
}
/** 0..1 progress toward the goal. */
export function progress(startedAt: number, goalHours: number, now: number): number {
  if (goalHours <= 0) return 0;
  return Math.min(1, elapsedMs(startedAt, now) / (goalHours * HOUR_MS));
}
/** Completion percentage (0..100, capped) for a finished fast. */
export function completionPct(r: Pick<FastRecord, 'startedAt' | 'endedAt' | 'goalHours'>): number {
  if (r.goalHours <= 0) return 0;
  return Math.min(100, Math.round(((r.endedAt - r.startedAt) / (r.goalHours * HOUR_MS)) * 100));
}

export interface Stage { fromHour: number; title: string; hint: string }
// General, approximate timelines. Individual responses vary; this is not medical guidance.
export const STAGES: Stage[] = [
  { fromHour: 0, title: 'Fed state', hint: 'Roughly the first few hours: your body is still working through your last meal.' },
  { fromHour: 4, title: 'Early fasting', hint: 'Around 4 hours in, many people are moving from the fed state toward fasting.' },
  { fromHour: 12, title: 'Fat-burning', hint: 'Around 12 hours, the body generally leans more on stored fat for energy (a rough estimate).' },
  { fromHour: 16, title: 'Deeper fast', hint: 'Around 16 hours, some research points to cellular clean-up processes (often called autophagy) increasing. Evidence in people is still limited.' },
  { fromHour: 24, title: 'Extended fast', hint: 'Beyond 24 hours is an extended fast. Check with a health professional before fasting this long.' },
];

export function stageAt(hoursElapsed: number): Stage {
  let cur = STAGES[0];
  for (const s of STAGES) if (hoursElapsed >= s.fromHour) cur = s;
  return cur;
}
export function nextStage(hoursElapsed: number): Stage | null {
  return STAGES.find((s) => s.fromHour > hoursElapsed) ?? null;
}

/** "HH:MM:SS" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}
/** "5h 20m" */
export function formatHM(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
