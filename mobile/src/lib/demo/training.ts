import { DemoError, type Route, type Store } from './types';
import { uid, today as utcToday } from './store';
import { EXERCISE_ROWS } from './training-data';

/* ------------------------------------------------------------------ types & catalog */
interface Ex {
  id: string; name: string; muscle_group: string; secondary_muscles: string[]; equipment: string[]; difficulty: string;
  is_compound: boolean; contraindications: string[]; instructions: string[]; common_mistakes: string[]; alternative_ids: string[]; media_url: null;
}
interface DayItem { exercise_id: string; sets: number; reps: number | string; rest_s: number }
interface Day { id: string; weekday: number; focus: string; is_rest: boolean; exercises: DayItem[] }
interface Plan { id: string; name: string; created_at: string; days: Day[] }
interface Session { id: string; day_id: string | null; log_date: string; started_at: string; finished_at: string | null; kcal_burned: number | null }
interface SetRow { id: string; session_id: string; exercise_id: string; set_number: number; reps: number | null; weight_kg: number | null; completed: boolean; skipped: boolean; is_pr: boolean }
interface WeightRow { id: string; log_date: string; weight_kg: number }

const CATALOG: Ex[] = EXERCISE_ROWS.map((r) => ({
  id: r[0], name: r[1], muscle_group: r[2], secondary_muscles: r[3], equipment: r[4], difficulty: r[5], is_compound: r[6],
  contraindications: r[7], instructions: r[8], common_mistakes: r[9], alternative_ids: r[10], media_url: null,
}));
const BY_ID: Record<string, Ex> = Object.fromEntries(CATALOG.map((e) => [e.id, e]));

const light = (e: Ex) => ({ id: e.id, name: e.name, muscle_group: e.muscle_group, equipment: e.equipment, difficulty: e.difficulty, is_compound: e.is_compound, media_url: null });
const full = (e: Ex) => ({ ...light(e), secondary_muscles: e.secondary_muscles, instructions: e.instructions, common_mistakes: e.common_mistakes, contraindications: e.contraindications, alternative_ids: e.alternative_ids });

/* ------------------------------------------------------------------ date helpers */
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoWeekday = (iso: string) => { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
const mondayOf = (iso: string) => addDays(iso, -(isoWeekday(iso) - 1));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const r1 = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ profile-driven plan generation */
const prof = (s: Store): Record<string, any> => s.get<Record<string, any>>('profile', {}) ?? {};
const num = (v: any, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

const HOME_EQ = ['bodyweight', 'dumbbell', 'bands', 'kettlebell', 'pullup_bar'];
function availableEquipment(p: Record<string, any>): Set<string> {
  const env = String(p.workout_env ?? 'gym');
  const own: string[] = Array.isArray(p.equipment) ? p.equipment.map(String) : [];
  if (env === 'gym') return new Set(['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'bands', 'kettlebell', 'pullup_bar']);
  return new Set(['bodyweight', ...own]);
}
const injuryText = (p: Record<string, any>) => (Array.isArray(p.injuries) ? p.injuries.join(' ') : String(p.injuries ?? '')).toLowerCase();
const isSafe = (e: Ex, inj: string) => !e.contraindications.some((c) => inj.includes(c));

function prescribe(e: Ex, goal: string, exp: string): { sets: number; reps: string; rest_s: number } {
  if (e.muscle_group === 'cardio') return { sets: 1, reps: `${exp === 'beginner' ? 15 : 20} min`, rest_s: 0 };
  if (/plank|hold|hang|wall sit/i.test(e.name)) return { sets: 3, reps: '30-45 s', rest_s: 45 };
  const lvl = exp === 'advanced' ? 2 : exp === 'intermediate' ? 1 : 0;
  let sets: number, reps: string, rest: number;
  if (goal === 'strength') [sets, reps, rest] = e.is_compound ? [[3, 4, 5][lvl], ['6-8', '4-6', '3-5'][lvl], [120, 150, 180][lvl]] : [3, '8-12', 75];
  else if (/muscle|gain|hypertrophy/.test(goal)) [sets, reps, rest] = e.is_compound ? [[3, 3, 4][lvl], ['8-10', '6-10', '6-10'][lvl], [90, 120, 120][lvl]] : [[2, 3, 3][lvl], '10-15', 60];
  else if (/lose|loss|fat/.test(goal)) [sets, reps, rest] = e.is_compound ? [3, '10-12', 60] : [[2, 3, 3][lvl], '12-15', 45];
  else [sets, reps, rest] = e.is_compound ? [3, '8-12', 90] : [[2, 3, 3][lvl], '10-15', 60];
  if (exp === 'beginner') sets = Math.min(sets, e.is_compound ? 3 : 2);
  return { sets, reps, rest_s: rest };
}

const SPLITS: Record<number, { weekdays: number[]; days: { focus: string; groups: [string, number][] }[] }> = {
  3: { weekdays: [1, 3, 5], days: [
    { focus: 'Full body A', groups: [['quads', 1], ['chest', 1], ['back', 1], ['shoulders', 1], ['core', 1]] },
    { focus: 'Full body B', groups: [['hamstrings', 1], ['glutes', 1], ['back', 1], ['chest', 1], ['biceps', 1], ['triceps', 1]] },
    { focus: 'Full body C', groups: [['quads', 1], ['shoulders', 1], ['back', 1], ['core', 1], ['cardio', 1]] }] },
  4: { weekdays: [1, 2, 4, 5], days: [
    { focus: 'Upper body: push focus', groups: [['chest', 2], ['shoulders', 1], ['triceps', 2], ['back', 1]] },
    { focus: 'Lower body', groups: [['quads', 2], ['hamstrings', 1], ['glutes', 1], ['calves', 1], ['core', 1]] },
    { focus: 'Upper body: pull focus', groups: [['back', 3], ['biceps', 2], ['shoulders', 1], ['chest', 1]] },
    { focus: 'Lower body and core', groups: [['glutes', 2], ['hamstrings', 1], ['quads', 1], ['core', 2], ['cardio', 1]] }] },
  5: { weekdays: [1, 2, 3, 5, 6], days: [
    { focus: 'Chest and triceps', groups: [['chest', 3], ['triceps', 2]] },
    { focus: 'Back and biceps', groups: [['back', 3], ['biceps', 2]] },
    { focus: 'Legs', groups: [['quads', 2], ['hamstrings', 1], ['glutes', 1], ['calves', 1]] },
    { focus: 'Shoulders and core', groups: [['shoulders', 3], ['core', 2]] },
    { focus: 'Conditioning', groups: [['cardio', 2], ['core', 1], ['glutes', 1], ['back', 1]] }] },
};

function generatePlan(p: Record<string, any>): Plan {
  const n = Math.min(5, Math.max(3, Math.round(num(p.training_days, 4))));
  const split = SPLITS[n];
  const goal = String(p.goal ?? p.goal_type ?? 'general_fitness').toLowerCase();
  const exp = String(p.experience ?? 'beginner').toLowerCase();
  const eq = availableEquipment(p);
  const inj = injuryText(p);
  const wdays = Array.isArray(p.workout_days) ? p.workout_days.map(Number).filter((d: number) => d >= 1 && d <= 7).sort() : [];
  const weekdays = wdays.length === n ? wdays : split.weekdays;
  const used = new Set<string>();
  const days: Day[] = [];
  let k = 0;
  for (let wd = 1; wd <= 7; wd++) {
    const idx = weekdays.indexOf(wd);
    if (idx < 0) { days.push({ id: uid(), weekday: wd, focus: 'Rest and recovery', is_rest: true, exercises: [] }); continue; }
    const def = split.days[k++ % split.days.length];
    const items: DayItem[] = [];
    for (const [g, cnt] of def.groups) {
      const pool = CATALOG.filter((e) => e.muscle_group === g && e.equipment.every((x) => eq.has(x) && (eq.has('barbell') || HOME_EQ.includes(x) || eq.has(x))) && isSafe(e, inj))
        .filter((e) => exp !== 'beginner' || e.difficulty !== 'advanced')
        .sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)) || Number(b.is_compound) - Number(a.is_compound));
      pool.slice(0, cnt).forEach((e) => { used.add(e.id); items.push({ exercise_id: e.id, ...prescribe(e, goal, exp) }); });
    }
    days.push({ id: uid(), weekday: wd, focus: def.focus, is_rest: false, exercises: items });
  }
  return { id: uid(), name: `${n}-day ${n === 3 ? 'full-body' : n === 4 ? 'upper/lower' : 'body-part'} split`, created_at: new Date().toISOString(), days };
}

function minutesFor(items: DayItem[]): number {
  const secs = items.reduce((a, i) => {
    const e = BY_ID[i.exercise_id];
    if (!e) return a;
    if (e.muscle_group === 'cardio') return a + (parseInt(String(i.reps), 10) || 15) * 60;
    return a + i.sets * (45 + i.rest_s);
  }, 0);
  return Math.max(5, Math.round(secs / 60) + 5);
}
const expandDay = (d: Day) => ({
  id: d.id, weekday: d.weekday, focus: d.focus, is_rest: d.is_rest, estimated_minutes: d.exercises.length ? minutesFor(d.exercises) : 0,
  exercises: d.exercises.filter((i) => BY_ID[i.exercise_id]).map((i) => ({ exercise: full(BY_ID[i.exercise_id]), sets: i.sets, reps: i.reps, rest_s: i.rest_s })),
});

/* ------------------------------------------------------------------ seeded history */
const K = { plan: 'tr.plan', sessions: 'tr.sessions', sets: 'tr.sets', weights: 'tr.weights', meas: 'tr.meas', photos: 'tr.photos', favs: 'tr.favs', seeded: 'tr.seeded', logDays: 'tr.logDays', waterDays: 'tr.waterDays' };
const activityKey = 'activity'; // Record<YYYY-MM-DD, {steps?, sleep_hours?}> (other agents may read it)

const pr = (w: number | null, r: number | null) => { const rr = r ?? 0; if (rr <= 0) return 0; return w && w > 0 ? w * (1 + rr / 30) : rr; };
const firstNum = (v: number | string) => parseInt(String(v), 10) || 10;

function ensureSeed(s: Store) {
  if (s.get<boolean>(K.seeded, false)) return;
  const t = utcToday();
  const p = prof(s);
  const plan = generatePlan(p);
  s.set(K.plan, plan);

  // weights: ~3 weeks, gently trending toward the goal
  const goal = String(p.goal ?? '').toLowerCase();
  const start = num(p.weight_kg, 74);
  const dir = /gain|muscle/.test(goal) ? 1 : /maint/.test(goal) ? 0 : -1;
  const weights: WeightRow[] = [];
  for (let i = 21; i >= 0; i -= i > 3 ? 3 : 1) {
    const noise = ((i * 7) % 5 - 2) * 0.1;
    weights.push({ id: uid(), log_date: addDays(t, -i), weight_kg: r1(start + dir * 0.9 * ((21 - i) / 21) + noise - dir * 0.9 * 0) });
  }
  s.set(K.weights, weights);

  // six finished workouts
  const workDays = plan.days.filter((d) => !d.is_rest);
  const offsets = [1, 2, 4, 7, 9, 12];
  const sessions: Session[] = []; const sets: SetRow[] = [];
  const kg = num(p.weight_kg, 74);
  offsets.slice().reverse().forEach((off, si) => {
    const day = workDays[si % workDays.length];
    const sid = uid();
    const date = addDays(t, -off);
    const mins = 38 + ((si * 5) % 17);
    const startAt = new Date(`${date}T17:30:00Z`);
    sessions.push({ id: sid, day_id: day.id, log_date: date, started_at: startAt.toISOString(), finished_at: new Date(startAt.getTime() + mins * 60000).toISOString(), kcal_burned: Math.round(4.5 * kg * mins / 60) });
    day.exercises.forEach((it) => {
      const e = BY_ID[it.exercise_id]; if (!e || e.muscle_group === 'cardio') return;
      const base = e.equipment.includes('barbell') ? 40 : e.equipment.includes('machine') || e.equipment.includes('cable') ? 30 : e.equipment.includes('dumbbell') ? 12 : 0;
      const w = base ? Math.round(base * (1 + 0.025 * si) / 2.5) * 2.5 : 0;
      for (let n = 1; n <= it.sets; n++) {
        const reps = Math.max(5, firstNum(it.reps) + (n === it.sets ? -1 : 0));
        const prior = sets.filter((x) => x.exercise_id === it.exercise_id).map((x) => pr(x.weight_kg, x.reps));
        sets.push({ id: uid(), session_id: sid, exercise_id: it.exercise_id, set_number: n, reps, weight_kg: w || null, completed: true, skipped: false, is_pr: prior.length > 0 && pr(w, reps) > Math.max(...prior) });
      }
    });
  });
  s.set(K.sessions, sessions); s.set(K.sets, sets);
  s.set(K.logDays, [1, 2, 3, 4, 5].map((n) => addDays(t, -n)));
  s.set(K.waterDays, [1, 2, 3].map((n) => addDays(t, -n)));
  s.set(K.seeded, true);
}

const getPlan = (s: Store) => s.get<Plan | null>(K.plan, null);
const profileWeight = (s: Store) => num(prof(s).weight_kg, 74);

/* ------------------------------------------------------------------ derived data */
const completedSets = (s: Store, sid?: string) => s.get<SetRow[]>(K.sets, []).filter((x) => x.completed && !x.skipped && (!sid || x.session_id === sid));
const volume = (rows: SetRow[]) => r1(rows.reduce((a, x) => a + (x.weight_kg ?? 0) * (x.reps ?? 0), 0));
const minutesOf = (x: Session) => (x.finished_at ? Math.max(1, Math.round((Date.parse(x.finished_at) - Date.parse(x.started_at)) / 60000)) : null);
const sessionOut = (x: Session) => ({ id: x.id, day_id: x.day_id, log_date: x.log_date, started_at: x.started_at, finished_at: x.finished_at, kcal_burned: x.kcal_burned });
const plannedSets = (plan: Plan | null, dayId: string | null) => { const d = plan?.days.find((x) => x.id === dayId); return d ? d.exercises.reduce((a, i) => a + i.sets, 0) : 0; };
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((100 * a) / b)) : 0);

/** Dates other demo modules may have recorded (best effort, tolerant of unknown shapes). */
function foreignDates(s: Store, keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const v: any = s.get<any>(k, null);
    if (!v) continue;
    const rows: any[] = Array.isArray(v) ? v : typeof v === 'object' ? Object.entries(v).map(([d, x]) => (Array.isArray(x) ? (x.length ? { log_date: d } : null) : x && typeof x === 'object' && !('log_date' in (x as any)) && /^\d{4}-/.test(d) ? { log_date: d } : x)) : [];
    rows.forEach((r) => { const d = r?.log_date ?? r?.date; if (typeof d === 'string') out.push(d.slice(0, 10)); });
  }
  return out;
}
function streak(days: string[], t: string) {
  const set = new Set(days);
  let d = set.has(t) ? t : addDays(t, -1), cur = 0;
  while (set.has(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev: string | null = null;
  for (const x of [...set].sort()) { run = prev && daysBetween(prev, x) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  return { current: cur, longest: best };
}

/* ------------------------------------------------------------------ routes */
const seeded = (fn: (c: Parameters<Route['handler']>[0]) => any): Route['handler'] => (c) => { ensureSeed(c.store); return fn(c); };

export const trainingRoutes: Route[] = [
  // ---- exercises
  { method: 'GET', path: '/v1/exercises', handler: ({ query, store }) => {
    const q = (query.q ?? '').toLowerCase(); const inj = injuryText(prof(store));
    const items = CATALOG.filter((e) =>
      (!q || e.name.toLowerCase().includes(q)) && (!query.muscle || e.muscle_group === query.muscle.toLowerCase()) &&
      (!query.equipment || e.equipment.includes(query.equipment.toLowerCase())) && (!query.difficulty || e.difficulty === query.difficulty.toLowerCase()) &&
      (query.safe_for_me !== 'true' || isSafe(e, inj))).map(light);
    return { items: items.slice(0, Number(query.limit) || 100), total: items.length };
  } },
  { method: 'GET', path: '/v1/exercises/:id', handler: ({ params, store }) => {
    const e = BY_ID[params.id]; if (!e) throw new DemoError(404, 'Exercise not found');
    const inj = injuryText(prof(store));
    return { ...full(e), safe_for_me: isSafe(e, inj), alternatives: e.alternative_ids.filter((a) => BY_ID[a]).map((a) => ({ ...light(BY_ID[a]), safe_for_me: isSafe(BY_ID[a], inj) })) };
  } },
  { method: 'GET', path: '/v1/favorites/exercises', handler: ({ store }) => ({ ids: store.get<string[]>(K.favs, []) }) },
  { method: 'POST', path: '/v1/favorites/exercises/:id', handler: ({ params, store }) => {
    if (!BY_ID[params.id]) throw new DemoError(404, 'Exercise not found');
    const f = store.get<string[]>(K.favs, []); if (!f.includes(params.id)) store.set(K.favs, [params.id, ...f]);
    return { exercise_id: params.id, favorite: true };
  } },
  { method: 'DELETE', path: '/v1/favorites/exercises/:id', handler: ({ params, store }) => {
    store.set(K.favs, store.get<string[]>(K.favs, []).filter((x) => x !== params.id));
    return { exercise_id: params.id, favorite: false };
  } },

  // ---- plan
  { method: 'GET', path: '/v1/workouts/plan', handler: seeded(({ store }) => { const p = getPlan(store); return { plan: p ? { id: p.id, name: p.name, created_at: p.created_at, days: p.days.map(expandDay) } : null }; }) },
  { method: 'POST', path: '/v1/workouts/plan/generate', handler: seeded(({ store }) => {
    const plan = generatePlan(prof(store)); store.set(K.plan, plan);
    return { plan: { id: plan.id, name: plan.name, created_at: plan.created_at, days: plan.days.map(expandDay) }, notes: ['Built from your goal, experience, equipment and any limitations you reported.', 'Increase the weight a little when you can hit the top of the rep range with good form.'], personalized: true,
      disclaimer: 'General guidance, not medical advice. Choose loads you can control with good form and stop if something hurts.' };
  }) },
  { method: 'GET', path: '/v1/workouts/today', handler: seeded(({ query, store }) => {
    const date = query.date || utcToday(); const plan = getPlan(store);
    const day = plan?.days.find((d) => d.weekday === isoWeekday(date)) ?? null;
    const sessions = store.get<Session[]>(K.sessions, []).filter((x) => x.log_date === date).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const open = sessions.find((x) => !x.finished_at);
    return { date, plan_id: plan?.id ?? null, day: day ? expandDay(day) : null, session: open ? sessionOut(open) : null, completed_today: sessions.some((x) => x.finished_at) };
  }) },
  { method: 'POST', path: '/v1/workouts/days/:id/replace-exercise', handler: seeded(({ params, body, store }) => {
    const plan = getPlan(store); const day = plan?.days.find((d) => d.id === params.id);
    if (!plan || !day) throw new DemoError(404, 'Workout day not found');
    const idx = day.exercises.findIndex((i) => i.exercise_id === body.exercise_id);
    if (idx < 0) throw new DemoError(422, 'That exercise is not in this workout day');
    const nw = BY_ID[body.replacement_id];
    if (!nw || nw.id === body.exercise_id) throw new DemoError(422, 'Invalid replacement exercise');
    if (!isSafe(nw, injuryText(prof(store)))) throw new DemoError(422, 'That exercise conflicts with your reported limitations');
    const old = BY_ID[body.exercise_id];
    const rx = old && old.muscle_group === nw.muscle_group && old.is_compound === nw.is_compound ? { sets: day.exercises[idx].sets, reps: day.exercises[idx].reps, rest_s: day.exercises[idx].rest_s } : prescribe(nw, String(prof(store).goal ?? ''), String(prof(store).experience ?? 'beginner'));
    day.exercises[idx] = { exercise_id: nw.id, ...rx }; store.set(K.plan, plan);
    return { day: expandDay(day) };
  }) },

  // ---- sessions
  { method: 'POST', path: '/v1/workouts/sessions', handler: seeded(({ body, store }) => {
    const sessions = store.get<Session[]>(K.sessions, []); const date = body.log_date || utcToday(); const dayId = body.day_id ?? null;
    const ex = sessions.find((x) => x.log_date === date && !x.finished_at && x.day_id === dayId);
    if (ex) return { session: sessionOut(ex), resumed: true };
    const s: Session = { id: uid(), day_id: dayId, log_date: date, started_at: new Date().toISOString(), finished_at: null, kcal_burned: null };
    store.set(K.sessions, [...sessions, s]);
    return { session: sessionOut(s), resumed: false };
  }) },
  { method: 'POST', path: '/v1/workouts/sessions/:id/sets', handler: seeded(({ params, body, store }) => {
    const sess = store.get<Session[]>(K.sessions, []).find((x) => x.id === params.id);
    if (!sess) throw new DemoError(404, 'Session not found');
    if (sess.finished_at) throw new DemoError(409, 'This session is already finished');
    if (!BY_ID[body.exercise_id]) throw new DemoError(422, 'Unknown exercise');
    const skipped = !!body.skipped; const completed = body.completed !== false && !skipped;
    const reps = body.reps ?? null; const weight = body.weight_kg ?? null;
    if (completed && !reps) throw new DemoError(422, 'reps is required for a completed set');
    const all = store.get<SetRow[]>(K.sets, []);
    const mine = all.find((x) => x.session_id === params.id && x.exercise_id === body.exercise_id && x.set_number === body.set_number);
    const prior = all.filter((x) => x.exercise_id === body.exercise_id && x.completed && !x.skipped && x !== mine).map((x) => pr(x.weight_kg, x.reps));
    const isPr = completed && prior.length > 0 && pr(weight, reps) > Math.max(...prior) + 1e-9;
    const row: SetRow = { id: mine?.id ?? uid(), session_id: params.id, exercise_id: body.exercise_id, set_number: Number(body.set_number) || 1, reps, weight_kg: weight, completed, skipped, is_pr: isPr };
    store.set(K.sets, mine ? all.map((x) => (x === mine ? row : x)) : [...all, row]);
    return { set: row, is_pr: isPr, e1rm: completed && weight && reps ? r1(weight * (1 + reps / 30)) : null };
  }) },
  { method: 'POST', path: '/v1/workouts/sessions/:id/finish', handler: seeded(({ params, store }) => {
    const sessions = store.get<Session[]>(K.sessions, []); const sess = sessions.find((x) => x.id === params.id);
    if (!sess) throw new DemoError(404, 'Session not found');
    if (sess.finished_at) throw new DemoError(409, 'This session is already finished');
    const all = store.get<SetRow[]>(K.sets, []).filter((x) => x.session_id === params.id);
    const done = all.filter((x) => x.completed && !x.skipped);
    const plan = getPlan(store);
    const now = new Date(); const minutes = Math.min(240, Math.max(0, (now.getTime() - Date.parse(sess.started_at)) / 60000));
    sess.finished_at = now.toISOString(); sess.kcal_burned = Math.round(4.5 * profileWeight(store) * minutes / 60);
    store.set(K.sessions, sessions);
    const best: Record<string, any> = {};
    done.filter((x) => x.is_pr).forEach((x) => { const sc = pr(x.weight_kg, x.reps); if (!best[x.exercise_id] || sc > best[x.exercise_id].e1rm) best[x.exercise_id] = { exercise_id: x.exercise_id, name: BY_ID[x.exercise_id]?.name, weight_kg: x.weight_kg, reps: x.reps, e1rm: r1(sc) }; });
    return { duration_min: Math.round(minutes), kcal_burned: sess.kcal_burned, kcal_is_estimate: true, completion_pct: pct(done.length, plannedSets(plan, sess.day_id) || all.length),
      sets_completed: done.length, total_volume_kg: volume(done), new_prs: Object.values(best) };
  }) },

  // ---- history / stats / prs
  { method: 'GET', path: '/v1/workouts/history', handler: seeded(({ query, store }) => {
    const limit = Math.max(1, Math.min(Number(query.limit) || 20, 100)); const plan = getPlan(store);
    const items = store.get<Session[]>(K.sessions, []).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit).map((x) => {
      const done = completedSets(store, x.id); const planned = plannedSets(plan, x.day_id);
      return { ...sessionOut(x), focus: plan?.days.find((d) => d.id === x.day_id)?.focus ?? null, sets_completed: done.length, exercises: new Set(done.map((d) => d.exercise_id)).size,
        prs: done.filter((d) => d.is_pr).length, volume_kg: volume(done), duration_min: minutesOf(x), completion_pct: pct(done.length, planned || done.length) };
    });
    return { items };
  }) },
  { method: 'GET', path: '/v1/workouts/stats', handler: seeded(({ query, store }) => {
    const weeks = Math.max(1, Math.min(Number(query.weeks) || 8, 26)); const t = query.today || utcToday();
    const first = addDays(mondayOf(t), -7 * (weeks - 1));
    const buckets = Array.from({ length: weeks }, (_, i) => ({ week_start: addDays(first, 7 * i), sessions: 0, volume_kg: 0, sets_completed: 0, minutes: 0, completion_pct: 0 }));
    const plan = getPlan(store); const planned = plan ? plan.days.filter((d) => !d.is_rest).length : 0;
    store.get<Session[]>(K.sessions, []).filter((x) => x.finished_at && x.log_date >= first && x.log_date <= t).forEach((x) => {
      const b = buckets.find((w) => w.week_start === mondayOf(x.log_date)); if (!b) return;
      const done = completedSets(store, x.id);
      b.sessions += 1; b.sets_completed += done.length; b.volume_kg = r1(b.volume_kg + volume(done)); b.minutes += minutesOf(x) ?? 0;
    });
    buckets.forEach((b) => { b.completion_pct = pct(b.sessions, planned); });
    const total = buckets.reduce((a, b) => a + b.sessions, 0); const cur = buckets[buckets.length - 1];
    return { weeks: buckets, totals: { sessions: total, sets_completed: buckets.reduce((a, b) => a + b.sets_completed, 0), volume_kg: r1(buckets.reduce((a, b) => a + b.volume_kg, 0)), minutes: buckets.reduce((a, b) => a + b.minutes, 0) },
      frequency_per_week: r1(total / weeks), frequency: r1(total / weeks), planned_sessions_per_week: planned, sessions_this_week: cur.sessions,
      adherence_pct: planned ? Math.min(100, Math.round((100 * total) / (planned * weeks))) : null, completion_pct: cur.completion_pct };
  }) },
  { method: 'GET', path: '/v1/workouts/prs', handler: seeded(({ store }) => {
    const dateOf = Object.fromEntries(store.get<Session[]>(K.sessions, []).map((x) => [x.id, x.log_date]));
    const best: Record<string, { sc: number; s: SetRow }> = {};
    completedSets(store).forEach((s) => { const sc = pr(s.weight_kg, s.reps); if (sc > 0 && (!best[s.exercise_id] || sc > best[s.exercise_id].sc)) best[s.exercise_id] = { sc, s }; });
    const items = Object.entries(best).map(([id, v]) => ({ exercise_id: id, name: BY_ID[id]?.name, exercise_name: BY_ID[id]?.name, muscle_group: BY_ID[id]?.muscle_group,
      best_weight_kg: v.s.weight_kg, weight_kg: v.s.weight_kg ?? 0, reps: v.s.reps, e1rm: r1(v.sc), achieved_on: dateOf[v.s.session_id] }));
    return { items: items.sort((a, b) => b.e1rm - a.e1rm) };
  }) },

  // ---- activity
  { method: 'POST', path: '/v1/activity', handler: ({ body, store }) => {
    const date = body.date || utcToday(); const all = store.get<Record<string, any>>(activityKey, {});
    const next = { ...(all[date] ?? {}), date }; if (body.steps != null) next.steps = Math.round(Number(body.steps)); if (body.sleep_hours != null) next.sleep_hours = Number(body.sleep_hours);
    store.set(activityKey, { ...all, [date]: next });
    return next;
  } },

  // ---- weight & measurements
  { method: 'GET', path: '/v1/weight', handler: seeded(({ query, store }) => {
    const days = Math.max(1, Number(query.days) || 90); const end = query.end || utcToday(); const start = addDays(end, -(days - 1));
    const rows = store.get<WeightRow[]>(K.weights, []).filter((w) => w.log_date >= start && w.log_date <= end).sort((a, b) => a.log_date.localeCompare(b.log_date));
    const trend = rows.map((r) => { const win = rows.filter((x) => x.log_date <= r.log_date && daysBetween(x.log_date, r.log_date) <= 6); const avg = Math.round((win.reduce((a, x) => a + x.weight_kg, 0) / win.length) * 100) / 100; return { log_date: r.log_date, avg_kg: avg, value: avg, weight_kg: avg }; });
    return { points: rows, trend_7d_avg: trend };
  }) },
  { method: 'POST', path: '/v1/weight', handler: seeded(({ body, store }) => {
    const kg = Number(body.weight_kg); if (!(kg >= 25 && kg <= 400)) throw new DemoError(422, 'Enter a weight between 25 and 400 kg');
    const date = body.log_date || utcToday(); const rows = store.get<WeightRow[]>(K.weights, []); const ex = rows.find((w) => w.log_date === date);
    const row = { id: ex?.id ?? uid(), log_date: date, weight_kg: kg };
    store.set(K.weights, ex ? rows.map((w) => (w === ex ? row : w)) : [...rows, row]);
    // keep the profile's current weight in sync when this is the latest weigh-in
    if (!rows.some((w) => w.log_date > date)) { const p = prof(store); if (Object.keys(p).length) store.set('profile', { ...p, weight_kg: kg }); }
    return { ...row, targets_updated: false };
  }) },
  { method: 'GET', path: '/v1/measurements', handler: seeded(({ query, store }) => {
    const end = query.end || utcToday(); const start = addDays(end, -((Number(query.days) || 365) - 1));
    return { items: store.get<any[]>(K.meas, []).filter((m) => m.log_date >= start && m.log_date <= end).sort((a, b) => b.log_date.localeCompare(a.log_date)) };
  }) },
  { method: 'POST', path: '/v1/measurements', handler: seeded(({ body, store }) => {
    const fields = ['waist_cm', 'chest_cm', 'arm_cm', 'hip_cm', 'thigh_cm', 'body_fat_pct'];
    const vals: Record<string, number> = {}; fields.forEach((f) => { if (body[f] != null && body[f] !== '') vals[f] = Number(body[f]); });
    if (!Object.keys(vals).length) throw new DemoError(422, 'Provide at least one measurement');
    const date = body.log_date || utcToday(); const rows = store.get<any[]>(K.meas, []); const ex = rows.find((m) => m.log_date === date);
    const row = { ...(ex ?? { id: uid() }), log_date: date, ...vals };
    store.set(K.meas, ex ? rows.map((m) => (m === ex ? row : m)) : [...rows, row]);
    return { measurement: row };
  }) },
  { method: 'GET', path: '/v1/progress/summary', handler: seeded(({ query, store }) => {
    const range = [30, 90, 365].includes(Number(query.range)) ? Number(query.range) : 30; const end = query.end || utcToday(); const start = addDays(end, -(range - 1));
    const all = store.get<WeightRow[]>(K.weights, []).filter((w) => w.log_date <= end).sort((a, b) => a.log_date.localeCompare(b.log_date));
    const inRange = all.filter((w) => w.log_date >= start); const p = prof(store);
    const journey = all[0]?.weight_kg ?? (p.weight_kg ? Number(p.weight_kg) : null); const current = all.length ? all[all.length - 1].weight_kg : journey;
    const rangeStart = inRange[0]?.weight_kg ?? null; const target = p.target_weight_kg ? Number(p.target_weight_kg) : null;
    let weekly: number | null = null;
    if (inRange.length >= 2) { // least-squares slope, kg/week
      const x0 = inRange[0].log_date; const xs = inRange.map((w) => daysBetween(x0, w.log_date)); const ys = inRange.map((w) => w.weight_kg);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = ys.reduce((a, b) => a + b, 0) / ys.length; const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
      if (den) weekly = Math.round((xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den) * 7 * 100) / 100;
    }
    let goalPct: number | null = null;
    if (journey != null && current != null && target != null) goalPct = Math.abs(target - journey) < 0.05 ? (Math.abs(current - target) <= 0.5 ? 100 : 0) : r1(Math.max(0, Math.min(100, ((current - journey) / (target - journey)) * 100)));
    const meas = store.get<any[]>(K.meas, []).filter((m) => m.log_date >= start && m.log_date <= end).sort((a, b) => a.log_date.localeCompare(b.log_date));
    const delta: Record<string, number | null> = {};
    ['waist_cm', 'chest_cm', 'arm_cm', 'hip_cm', 'thigh_cm', 'body_fat_pct'].forEach((f) => { const v = meas.filter((m) => m[f] != null).map((m) => Number(m[f])); delta[f] = v.length >= 2 ? r1(v[v.length - 1] - v[0]) : null; });
    const h = num(p.height_cm, 0);
    return { range, start, end, start_weight: rangeStart, journey_start_weight: journey, current_weight: current, target_weight: target, goal_pct: goalPct,
      change_kg: current != null && rangeStart != null ? r1(current - rangeStart) : null, weekly_change_kg: weekly, bmi: current && h ? r1(current / (h / 100) ** 2) : null,
      measurements_delta: delta, photos_count: store.get<any[]>(K.photos, []).length };
  }) },

  // ---- photos (stored as the URI the picker returned)
  { method: 'GET', path: '/v1/progress/photos', handler: ({ store }) => ({ photos: store.get<any[]>(K.photos, []).slice().sort((a, b) => b.taken_on.localeCompare(a.taken_on)) }) },
  { method: 'POST', path: '/v1/progress/photos', handler: ({ body, store }) => {
    if (!body.image_path) throw new DemoError(422, 'image_path is required');
    const photo = { id: uid(), image_path: String(body.image_path), angle: body.angle ?? null, taken_on: body.taken_on || utcToday(), created_at: new Date().toISOString(), signed_url: String(body.image_path) };
    store.set(K.photos, [...store.get<any[]>(K.photos, []), photo]);
    return { photo };
  } },
  { method: 'DELETE', path: '/v1/progress/photos/:id', handler: ({ params, store }) => {
    const rows = store.get<any[]>(K.photos, []); if (!rows.some((p) => p.id === params.id)) throw new DemoError(404, 'Photo not found');
    store.set(K.photos, rows.filter((p) => p.id !== params.id)); return { deleted: true };
  } },

  // ---- streaks
  { method: 'GET', path: '/v1/streaks', handler: seeded(({ query, store }) => {
    const t = query.today || utcToday();
    const workoutDays = store.get<Session[]>(K.sessions, []).filter((x) => x.finished_at).map((x) => x.log_date);
    const logDays = [...store.get<string[]>(K.logDays, []), ...foreignDates(store, ['meals', 'meal_logs', 'nutrition.meals', 'nutrition.logs'])];
    const waterDays = [...store.get<string[]>(K.waterDays, [])];
    const scans = (() => { const v: any = store.get<any>('scans', []); return Array.isArray(v) ? v.length : 0; })();
    const logging = streak(logDays, t), workout = streak(workoutDays, t), water = streak(waterDays, t);
    const wc = new Set(workoutDays).size;
    const badge = (key: string, title: string, description: string, value: number, goal: number) => ({ key, title, description, earned: value >= goal, progress: Math.min(value, goal), goal });
    return { streaks: { logging, workout, water }, totals: { workouts: wc, scans },
      badges: [badge('streak_7', '7-day streak', 'Log meals 7 days in a row', logging.longest, 7), badge('first_workout', 'First workout', 'Finish your first workout', wc, 1),
        badge('workouts_10', '10 workouts', 'Finish 10 workouts', wc, 10), badge('first_scan', 'First scan', 'Scan your first meal', scans, 1), badge('hydration_7', 'Hydration hero', 'Hit your water goal 7 days in a row', water.longest, 7)] };
  }) },

  // ---- weekly report (template summary from stored data)
  { method: 'GET', path: '/v1/reports/weekly', handler: seeded(({ query, store }) => {
    const end = query.end || utcToday(); const start = addDays(end, -6); const p = prof(store);
    const sessions = store.get<Session[]>(K.sessions, []).filter((x) => x.finished_at && x.log_date >= start && x.log_date <= end);
    const plan = getPlan(store); const planned = plan ? plan.days.filter((d) => !d.is_rest).length : 0;
    const wt = store.get<WeightRow[]>(K.weights, []).filter((w) => w.log_date >= start && w.log_date <= end).sort((a, b) => a.log_date.localeCompare(b.log_date));
    const change = wt.length >= 2 ? r1(wt[wt.length - 1].weight_kg - wt[0].weight_kg) : null;
    const logged = new Set([...store.get<string[]>(K.logDays, []), ...foreignDates(store, ['meals', 'meal_logs', 'nutrition.meals', 'nutrition.logs'])].filter((d) => d >= start && d <= end)).size;
    const waterDays = new Set(store.get<string[]>(K.waterDays, []).filter((d) => d >= start && d <= end)).size;
    const tk = num(p.target_kcal, 2000), tp = num(p.target_protein_g, 110);
    const stats = {
      week: { start, end }, goal: p.goal ?? null,
      nutrition: { days_logged: logged, avg_kcal: null, avg_protein_g: null, avg_carbs_g: null, avg_fat_g: null, target_kcal: tk, target_protein_g: tp, days_on_target: Math.min(logged, 3), protein_days: Math.min(logged, 3), adherence_pct: Math.round((100 * Math.min(logged, 3)) / 7) },
      workouts: { completed: sessions.length, planned, completion_pct: planned ? Math.min(100, Math.round((100 * sessions.length) / planned)) : null },
      weight: { change_kg: change, start_kg: wt[0]?.weight_kg ?? null, end_kg: wt[wt.length - 1]?.weight_kg ?? null, entries: wt.length },
      hydration: { days_goal_met: waterDays, consistency_pct: Math.round((100 * waterDays) / 7), avg_ml: null },
    };
    const parts = [logged ? `You logged meals on ${logged} of 7 days (targets ${tk} kcal / ${tp} g protein).` : 'No meals were logged this week.'];
    if (planned) parts.push(`You completed ${sessions.length} of ${planned} planned workouts.`); else if (sessions.length) parts.push(`You completed ${sessions.length} workouts.`);
    if (change != null) parts.push(`Weight changed ${change >= 0 ? '+' : ''}${change.toFixed(1)} kg.`);
    const recs: string[] = [];
    if (logged < 5) recs.push(`You logged food on ${logged} of 7 days. Aim for at least 5 so your averages are reliable.`);
    if (planned && sessions.length < planned) recs.push(`You completed ${sessions.length} of ${planned} planned workouts. Put your next sessions in your calendar at fixed times to make them easier to keep.`);
    else if (planned) recs.push('You completed every planned workout. Keep sleep and protein consistent so you recover well.');
    if (change != null) recs.push(`Your logged weight changed by ${change >= 0 ? '+' : ''}${change.toFixed(1)} kg this week. Day-to-day weight is noisy, so judge progress by the 3-4 week trend.`);
    else recs.push('Log your weight at least twice a week (same time of day) so we can show a trend.');
    return { stats, summary: parts.join(' '), recommendations: recs, used_llm: false, disclaimer: 'Based on the data you logged. Not medical advice.' };
  }) },
];
