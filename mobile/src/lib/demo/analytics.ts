import type { Ctx, Route } from './types';

// Analytics are computed from what the other demo modules store (meals, drinks, weights, sessions).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const range = (start: Date, days: number) => Array.from({ length: days }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return iso(d); });
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

function build(c: Ctx, keys: string[], asOf: string) {
  const t = { kcal: 2200, protein_g: 140, carbs_g: 250, fat_g: 70, water_ml: 3000, ...c.store.get<any>('profile_targets', {}) };
  const meals = c.store.get<any[]>('nutri_meals', []);
  const drinks = c.store.get<any[]>('nutri_drinks', []);
  const weights = c.store.get<any[]>('tr.weights', []);
  const sessions = c.store.get<any[]>('tr.sessions', []);
  const sum = (d: string, f: string) => meals.filter((m) => m.log_date === d).reduce((s, m) => s + (m.items ?? []).reduce((a: number, i: any) => a + (Number(i[f]) || 0), 0), 0);
  const calories = keys.map((d) => Math.round(sum(d, 'kcal')));
  const protein = keys.map((d) => r1(sum(d, 'protein_g')));
  const carbs = keys.map((d) => r1(sum(d, 'carbs_g')));
  const fat = keys.map((d) => r1(sum(d, 'fat_g')));
  const water = keys.map((d) => drinks.filter((x) => x.log_date === d && x.counts_toward_goal !== false).reduce((s, x) => s + (Number(x.amount_ml) || 0), 0));
  const workouts = keys.map((d) => sessions.filter((s) => s.log_date === d && s.finished_at).length);
  const weight = keys.map((d) => { const w = weights.filter((x) => x.log_date === d).pop(); return w ? Number(w.weight_kg) : null; });
  const counted = keys.filter((d) => d <= asOf);
  const logged = counted.filter((d) => calories[keys.indexOf(d)] > 0);
  const onTarget = logged.filter((d) => Math.abs(calories[keys.indexOf(d)] - t.kcal) <= t.kcal * 0.1);
  let streak = 0;
  for (let i = counted.length - 1; i >= 0; i--) { if (calories[keys.indexOf(counted[i])] > 0) streak++; else if (i !== counted.length - 1) break; }
  const nz = (a: number[]) => a.filter((x) => x > 0);
  return {
    range: { start: keys[0], end: keys[keys.length - 1], days: keys.length, as_of: asOf },
    labels: keys,
    series: { calories, protein, carbs, fat, water, workouts, weight },
    averages: { calories: Math.round(avg(nz(calories))), protein: r1(avg(nz(protein))), carbs: r1(avg(nz(carbs))), fat: r1(avg(nz(fat))), water: Math.round(avg(nz(water))) },
    totals: { calories: calories.reduce((a, b) => a + b, 0), workouts: workouts.reduce((a, b) => a + b, 0), days_logged: logged.length },
    targets: t,
    target_kcal: t.kcal, target_water_ml: t.water_ml,
    adherence_pct: counted.length ? Math.round((onTarget.length / counted.length) * 100) : null,
    streak_days: streak,
  };
}

export const analyticsRoutes: Route[] = [
  { method: 'GET', path: '/v1/analytics/daily', handler: (c) => { const d = c.query.date; const r: any = build(c, [d], d); r.workout_completed = r.series.workouts[0] > 0; return r; } },
  { method: 'GET', path: '/v1/analytics/weekly', handler: (c) => { const end = new Date(c.query.end + 'T12:00:00'); const s = new Date(end); s.setDate(s.getDate() - 6); return build(c, range(s, 7), c.query.end); } },
  { method: 'GET', path: '/v1/analytics/monthly', handler: (c) => {
    const [y, m] = c.query.month.split('-').map(Number); const days = new Date(y, m, 0).getDate();
    const keys = range(new Date(y, m - 1, 1, 12), days); const today = iso(new Date());
    return build(c, keys, keys[keys.length - 1] < today ? keys[keys.length - 1] : today);
  } },
];
