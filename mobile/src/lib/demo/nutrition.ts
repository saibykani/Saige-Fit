import { DemoError, type Ctx, type Route } from './types';
import { uid } from './store';
import { BARCODES, DemoFood, DemoRecipe, FOODS, FOOD_BY_ID, RECIPES, USDA, mkFood } from './nutrition-data';

/* ------------------------------------------------------------------ helpers */
const pad = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localToday = () => isoLocal(new Date());
const addDaysIso = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return isoLocal(x); };
const r1 = (v: number) => Math.round(v * 10) / 10;

type Targets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number; fiber_g?: number };
const targetsOf = (c: Ctx): Targets => ({ kcal: 2200, protein_g: 140, carbs_g: 250, fat_g: 70, water_ml: 3000, ...c.store.get<Partial<Targets>>('profile_targets', {}) });

interface Item { id: string; meal_id: string; food_id: string | null; name: string; quantity_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; is_estimate?: boolean; user_edited?: boolean }
interface Meal { id: string; log_date: string; meal_type: string; eaten_at: string; photo_path: string | null; items: Item[] }
interface Macros { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }

const customFoods = (c: Ctx) => c.store.get<DemoFood[]>('nutri_custom_foods', []);
const allFoods = (c: Ctx) => [...FOODS, ...customFoods(c)];
const findFood = (c: Ctx, id: string | null | undefined) => (id ? FOOD_BY_ID[id] ?? customFoods(c).find((f) => f.id === id) : undefined);

const scale = (f: DemoFood, grams: number): Macros => {
  const n = f.food_nutrition, k = grams / 100;
  return { kcal: Math.round(n.kcal * k), protein_g: r1(n.protein_g * k), carbs_g: r1(n.carbs_g * k), fat_g: r1(n.fat_g * k), fiber_g: r1(n.fiber_g * k) };
};
const sum = (list: Macros[]): Macros => {
  const t = list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein_g: a.protein_g + m.protein_g, carbs_g: a.carbs_g + m.carbs_g, fat_g: a.fat_g + m.fat_g, fiber_g: a.fiber_g + (m.fiber_g || 0) }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  return { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g), fiber_g: r1(t.fiber_g) };
};
const recipeMacros = (r: DemoRecipe): Macros => sum(r.ingredients.map((i) => scale(FOOD_BY_ID[i.food_id], i.grams / r.servings)));
const recipeGrams = (r: DemoRecipe) => Math.round(r.ingredients.reduce((a, i) => a + i.grams, 0) / r.servings);

function mkItem(c: Ctx, mealId: string, food: DemoFood | undefined, name: string, grams: number, extra: Partial<Item> = {}): Item {
  const m = food ? scale(food, grams) : { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
  return { id: uid(), meal_id: mealId, food_id: food?.id ?? null, name: food?.name ?? name, quantity_g: grams, ...m, ...extra };
}

function loadMeals(c: Ctx): Meal[] {
  if (!c.store.get<boolean>('nutri_seeded', false)) {
    c.store.set('nutri_seeded', true);
    const day = localToday();
    const seed = (type: string, hh: number, lines: [string, number][]): Meal => {
      const id = uid();
      return { id, log_date: day, meal_type: type, eaten_at: `${day}T${pad(hh)}:15:00`, photo_path: null, items: lines.map(([fid, g]) => mkItem(c, id, FOOD_BY_ID[fid], fid, g)) };
    };
    c.store.set('nutri_meals', [
      seed('breakfast', 8, [['f_poha', 200], ['f_chai', 150]]),
      seed('lunch', 13, [['f_roti', 80], ['f_dal', 200], ['f_alugobi', 150], ['f_salad', 100]]),
    ]);
  }
  return c.store.get<Meal[]>('nutri_meals', []);
}
const saveMeals = (c: Ctx, m: Meal[]) => c.store.set('nutri_meals', m);
const mealTotal = (m: Meal) => sum(m.items);
const mealOut = (m: Meal) => ({ id: m.id, meal_type: m.meal_type, eaten_at: m.eaten_at, photo_path: m.photo_path, items: m.items, total: mealTotal(m) });

function addMealFromRecipe(c: Ctx, r: DemoRecipe, date: string, type: string) {
  const meals = loadMeals(c);
  const id = uid();
  const items = r.ingredients.map((i) => mkItem(c, id, FOOD_BY_ID[i.food_id], i.food_id, Math.round(i.grams / r.servings)));
  meals.push({ id, log_date: date, meal_type: type, eaten_at: `${date}T${pad(new Date().getHours())}:${pad(new Date().getMinutes())}:00`, photo_path: null, items });
  saveMeals(c, meals);
  return id;
}

/* --------------------------------------------------------------- hydration */
interface Drink { id: string; log_date: string; amount_ml: number; beverage: string; counts_toward_goal: boolean; logged_at: string }
function loadDrinks(c: Ctx): Drink[] {
  if (!c.store.get<boolean>('nutri_hyd_seeded', false)) {
    c.store.set('nutri_hyd_seeded', true);
    const day = localToday();
    const out: Drink[] = [];
    const totals = [2400, 2800, 1900, 3100, 2600, 2200]; // previous 6 days
    totals.forEach((t, i) => {
      const d = addDaysIso(day, -(i + 1));
      [0.3, 0.3, 0.25, 0.15].forEach((share, k) => out.push({ id: uid(), log_date: d, amount_ml: Math.round((t * share) / 50) * 50, beverage: 'water', counts_toward_goal: true, logged_at: `${d}T${pad(9 + k * 3)}:00:00` }));
    });
    out.push({ id: uid(), log_date: day, amount_ml: 500, beverage: 'water', counts_toward_goal: true, logged_at: `${day}T08:30:00` });
    out.push({ id: uid(), log_date: day, amount_ml: 250, beverage: 'water', counts_toward_goal: true, logged_at: `${day}T11:00:00` });
    out.push({ id: uid(), log_date: day, amount_ml: 150, beverage: 'tea', counts_toward_goal: false, logged_at: `${day}T08:20:00` });
    c.store.set('nutri_drinks', out);
  }
  return c.store.get<Drink[]>('nutri_drinks', []);
}
const waterTarget = (c: Ctx) => c.store.get<number>('nutri_water_target', targetsOf(c).water_ml);
const waterOn = (drinks: Drink[], date: string) => drinks.filter((d) => d.log_date === date && d.counts_toward_goal).reduce((a, d) => a + d.amount_ml, 0);

/* -------------------------------------------------------------- diet plans */
const SLOT_RECIPES: Record<string, string[]> = {
  breakfast: ['r_poha', 'r_oats', 'r_omelette', 'r_idli'],
  lunch: ['r_dalrice', 'r_paneerroti', 'r_chicken', 'r_rajma', 'r_chole', 'r_fish', 'r_chickencurry'],
  evening_snack: ['r_sprouts', 'r_yogurt', 'r_smoothie'],
  dinner: ['r_khichdi', 'r_tofu', 'r_chickencurry', 'r_paneerroti', 'r_fish', 'r_dalrice'],
};
const SLOT_TIME: Record<string, string> = { breakfast: '08:00', lunch: '13:00', evening_snack: '17:00', dinner: '20:00' };
const recipeById = (id: string) => RECIPES.find((r) => r.id === id);

interface PlanMealRec { id: string; meal_type: string; recipe_id: string; scheduled_time: string; logged?: boolean }
type Plans = Record<string, { plan_id: string; meals: PlanMealRec[] }>;

function userDiet(c: Ctx): string | null {
  const p = c.store.get<any>('profile', null);
  const d = p?.diet_type ?? p?.diet?.diet_type ?? c.store.get<any>('me', null)?.diet?.diet_type ?? null;
  return typeof d === 'string' ? d : null;
}
function slotPool(c: Ctx, slot: string): DemoRecipe[] {
  const diet = userDiet(c);
  const all = SLOT_RECIPES[slot].map((id) => recipeById(id)!);
  const ok = diet ? all.filter((r) => r.diet_tags.includes(diet)) : all;
  return ok.length ? ok : all;
}
function generatePlan(c: Ctx, start: string, days: number, planId = uid()): string {
  const plans = c.store.get<Plans>('nutri_plans', {});
  const offset = Math.floor(Math.random() * 5);
  for (let i = 0; i < days; i++) {
    const date = addDaysIso(start, i);
    plans[date] = {
      plan_id: planId,
      meals: Object.keys(SLOT_RECIPES).map((slot) => {
        const pool = slotPool(c, slot);
        return { id: uid(), meal_type: slot, recipe_id: pool[(i + offset) % pool.length].id, scheduled_time: SLOT_TIME[slot] };
      }),
    };
  }
  c.store.set('nutri_plans', plans);
  return planId;
}
function planMealOut(c: Ctx, m: PlanMealRec) {
  const r = recipeById(m.recipe_id)!;
  const mac = recipeMacros(r);
  const pool = slotPool(c, m.meal_type).filter((x) => x.id !== r.id).slice(0, 3);
  return {
    id: m.id, meal_type: m.meal_type, name: r.name, recipe_id: r.id, quantity_g: recipeGrams(r), kcal: mac.kcal, protein_g: mac.protein_g, carbs_g: mac.carbs_g, fat_g: mac.fat_g,
    instructions: r.steps.join(' '), scheduled_time: m.scheduled_time, logged: !!m.logged,
    alternatives: pool.map((a) => { const am = recipeMacros(a); return { name: a.name, kcal: am.kcal, protein_g: am.protein_g, quantity_g: recipeGrams(a), recipe_id: a.id }; }),
  };
}
function findPlanMeal(c: Ctx, id: string) {
  const plans = c.store.get<Plans>('nutri_plans', {});
  for (const [date, p] of Object.entries(plans)) {
    const m = p.meals.find((x) => x.id === id);
    if (m) return { plans, date, plan: p, meal: m };
  }
  throw new DemoError(404, 'Plan meal not found');
}

/* ----------------------------------------------------------- recipes output */
function recipeOut(c: Ctx, r: DemoRecipe, detail = false) {
  const mac = recipeMacros(r);
  const out: any = {
    id: r.id, name: r.name, description: r.description, servings: r.servings, prep_minutes: r.prep_minutes, diet_tags: r.diet_tags,
    nutrition: mac, ...mac, is_favorite: c.store.get<string[]>('nutri_fav_recipes', []).includes(r.id),
  };
  if (detail) {
    out.steps = r.steps;
    out.ingredients = r.ingredients.map((i) => ({ food_id: i.food_id, name: FOOD_BY_ID[i.food_id].name, grams: i.grams, quantity_g: i.grams }));
  }
  return out;
}

/* ------------------------------------------------------------------ routes */
const slotForHour = (h: number) => (h < 10 ? 'breakfast' : h < 12 ? 'mid_morning' : h < 15 ? 'lunch' : h < 18 ? 'evening_snack' : h < 22 ? 'dinner' : 'snack');

function consumedOn(c: Ctx, date: string) {
  const meals = loadMeals(c).filter((m) => m.log_date === date);
  return { meals, total: sum(meals.map(mealTotal)) };
}
function remainingOn(c: Ctx, date: string) {
  const t = targetsOf(c);
  const { total } = consumedOn(c, date);
  return { t, total, rem: { kcal: Math.round(t.kcal - total.kcal), protein_g: r1(t.protein_g - total.protein_g), carbs_g: r1(t.carbs_g - total.carbs_g), fat_g: r1(t.fat_g - total.fat_g) } };
}

const foodHash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

export const nutritionRoutes: Route[] = [
  /* ---- journal ---- */
  { method: 'GET', path: '/v1/meals', handler: (c) => ({ meals: loadMeals(c.store ? c : c).filter((m) => m.log_date === (c.query.date || localToday())).sort((a, b) => a.eaten_at.localeCompare(b.eaten_at)).map(mealOut) }) },
  {
    method: 'POST', path: '/v1/meals', handler: (c) => {
      const b = c.body;
      const meals = loadMeals(c);
      const id = uid();
      const date = b.log_date || localToday();
      const items: Item[] = (b.items ?? []).map((i: any) => mkItem(c, id, findFood(c, i.food_id), i.name ?? 'Food', Number(i.quantity_g) || 100, { user_edited: !!i.user_edited, is_estimate: !!b.is_estimate }));
      const now = new Date();
      meals.push({ id, log_date: date, meal_type: b.meal_type || 'snack', eaten_at: `${date}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`, photo_path: b.photo_path ?? null, items });
      saveMeals(c, meals);
      return { meal_id: id };
    },
  },
  { method: 'GET', path: '/v1/meals/:id', handler: (c) => { const m = loadMeals(c).find((x) => x.id === c.params.id); if (!m) throw new DemoError(404, 'Meal not found'); return mealOut(m); } },
  { method: 'DELETE', path: '/v1/meals/:id', handler: (c) => { saveMeals(c, loadMeals(c).filter((m) => m.id !== c.params.id)); return { ok: true }; } },
  {
    method: 'PATCH', path: '/v1/meals/:id/items/:itemId', handler: (c) => {
      const meals = loadMeals(c);
      const m = meals.find((x) => x.id === c.params.id);
      const i = m?.items.find((x) => x.id === c.params.itemId);
      if (!m || !i) throw new DemoError(404, 'Item not found');
      const g = Number(c.body.quantity_g);
      if (!(g > 0)) throw new DemoError(422, 'quantity_g must be positive');
      const f = findFood(c, i.food_id);
      if (f) Object.assign(i, scale(f, g));
      else { const k = g / (i.quantity_g || 1); Object.assign(i, { kcal: Math.round(i.kcal * k), protein_g: r1(i.protein_g * k), carbs_g: r1(i.carbs_g * k), fat_g: r1(i.fat_g * k), fiber_g: r1(i.fiber_g * k) }); }
      i.quantity_g = g; i.user_edited = true;
      saveMeals(c, meals);
      return i;
    },
  },
  {
    method: 'DELETE', path: '/v1/meals/:id/items/:itemId', handler: (c) => {
      let meals = loadMeals(c);
      const m = meals.find((x) => x.id === c.params.id);
      if (m) m.items = m.items.filter((x) => x.id !== c.params.itemId);
      meals = meals.filter((x) => x.items.length > 0);
      saveMeals(c, meals);
      return { ok: true };
    },
  },

  /* ---- foods ---- */
  {
    method: 'GET', path: '/v1/foods/search', handler: (c) => {
      const q = (c.query.q ?? '').trim().toLowerCase();
      if (!q) return { items: [] };
      const hits = allFoods(c).filter((f) => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
      hits.sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)));
      return { items: hits.slice(0, 30) };
    },
  },
  {
    method: 'GET', path: '/v1/foods/recent', handler: (c) => {
      const seen = new Set<string>(); const out: DemoFood[] = [];
      for (const m of [...loadMeals(c)].reverse()) for (const i of m.items) {
        const f = findFood(c, i.food_id);
        if (f && !seen.has(f.id) && out.length < 20) { seen.add(f.id); out.push(f); }
      }
      return { items: out };
    },
  },
  {
    method: 'POST', path: '/v1/foods', handler: (c) => {
      const b = c.body;
      if (!b.name) throw new DemoError(422, 'name is required');
      const f = mkFood('custom_' + uid(), String(b.name), b.default_serving_g ? `${b.default_serving_g} g` : '100 g', Number(b.default_serving_g) || 100,
        Number(b.kcal) || 0, Number(b.protein_g) || 0, Number(b.carbs_g) || 0, Number(b.fat_g) || 0, Number(b.fiber_g) || 0, 'Custom', [], []);
      f.custom = true; f.brand = 'My foods';
      Object.assign(f.food_nutrition, { sat_fat_g: b.sat_fat_g ?? null, sugar_g: b.sugar_g ?? null, sodium_mg: b.sodium_mg ?? null });
      c.store.set('nutri_custom_foods', [...customFoods(c), f]);
      return f;
    },
  },
  {
    method: 'GET', path: '/v1/foods/barcode/:code', handler: (c) => {
      const id = BARCODES[c.params.code];
      if (id) return { food: { ...FOOD_BY_ID[id], brand: 'Demo Brand' } };
      // Unknown codes still resolve in demo mode so the scanner flow is always showable.
      const pool = FOODS.filter((f) => ['Snacks', 'Drinks', 'Dairy', 'Grains', 'Nuts'].includes(f.category));
      const f = pool[foodHash(c.params.code) % pool.length];
      return { food: { ...f, id: 'bc_' + c.params.code, brand: 'Demo Brand' } };
    },
  },
  {
    method: 'GET', path: '/v1/foods/usda', handler: (c) => {
      const q = (c.query.q ?? '').trim().toLowerCase();
      const items = USDA.filter((f) => f.name.toLowerCase().includes(q) || q.split(/\s+/).some((w) => w.length > 2 && f.name.toLowerCase().includes(w)))
        .map(({ id: _id, ...rest }) => rest);
      return { items };
    },
  },
  {
    method: 'POST', path: '/v1/foods/usda/import', handler: (c) => {
      const u = USDA.find((f) => String(f.fdc_id) === String(c.body.fdc_id));
      if (!u) throw new DemoError(404, 'USDA food not found');
      const existing = customFoods(c).find((f) => f.id === u.id);
      if (existing) return existing;
      const { fdc_id: _f, ...food } = u;
      c.store.set('nutri_custom_foods', [...customFoods(c), food]);
      return food;
    },
  },

  /* ---- favorites ---- */
  {
    method: 'GET', path: '/v1/favorites/foods', handler: (c) =>
      ({ items: c.store.get<string[]>('nutri_fav_foods', ['f_paneer', 'f_dal', 'f_banana']).map((id) => findFood(c, id)).filter(Boolean) }),
  },
  {
    method: 'POST', path: '/v1/favorites/foods', handler: (c) => {
      const ids = c.store.get<string[]>('nutri_fav_foods', ['f_paneer', 'f_dal', 'f_banana']);
      if (c.body.food_id && !ids.includes(c.body.food_id)) c.store.set('nutri_fav_foods', [...ids, c.body.food_id]);
      return { ok: true };
    },
  },
  {
    method: 'DELETE', path: '/v1/favorites/foods/:id', handler: (c) => {
      c.store.set('nutri_fav_foods', c.store.get<string[]>('nutri_fav_foods', ['f_paneer', 'f_dal', 'f_banana']).filter((x) => x !== c.params.id));
      return { ok: true };
    },
  },
  {
    method: 'POST', path: '/v1/favorites/recipes/:id', handler: (c) => {
      const ids = c.store.get<string[]>('nutri_fav_recipes', []);
      if (!ids.includes(c.params.id)) c.store.set('nutri_fav_recipes', [...ids, c.params.id]);
      return { ok: true };
    },
  },
  { method: 'DELETE', path: '/v1/favorites/recipes/:id', handler: (c) => { c.store.set('nutri_fav_recipes', c.store.get<string[]>('nutri_fav_recipes', []).filter((x) => x !== c.params.id)); return { ok: true }; } },

  /* ---- hydration ---- */
  {
    method: 'GET', path: '/v1/hydration', handler: (c) => {
      const date = c.query.date || localToday();
      const logs = loadDrinks(c).filter((d) => d.log_date === date).sort((a, b) => b.logged_at.localeCompare(a.logged_at));
      return {
        target_ml: waterTarget(c), total_ml: logs.reduce((a, d) => a + d.amount_ml, 0), water_ml: waterOn(logs, date),
        logs: logs.map(({ log_date: _d, ...l }) => l),
      };
    },
  },
  {
    method: 'POST', path: '/v1/hydration', handler: (c) => {
      const drinks = loadDrinks(c);
      const beverage = c.body.beverage || 'water';
      const date = c.body.log_date || localToday();
      const now = new Date();
      const d: Drink = {
        id: uid(), log_date: date, amount_ml: Number(c.body.amount_ml) || 250, beverage,
        counts_toward_goal: c.body.counts_toward_goal ?? beverage === 'water', logged_at: `${date}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      };
      drinks.push(d);
      c.store.set('nutri_drinks', drinks);
      return d;
    },
  },
  {
    method: 'PUT', path: '/v1/hydration/target', handler: (c) => {
      const t = Number(c.body.target_ml);
      if (!(t >= 500 && t <= 8000)) throw new DemoError(422, 'target_ml must be 500..8000');
      c.store.set('nutri_water_target', t);
      return { target_ml: t };
    },
  },
  {
    method: 'GET', path: '/v1/hydration/history', handler: (c) => {
      const days = Math.max(1, Math.min(90, Number(c.query.days) || 14));
      const drinks = loadDrinks(c);
      const end = localToday();
      return { target_ml: waterTarget(c), days: Array.from({ length: days }, (_, i) => { const date = addDaysIso(end, i - (days - 1)); return { date, water_ml: waterOn(drinks, date) }; }) };
    },
  },
  { method: 'DELETE', path: '/v1/hydration/:id', handler: (c) => { c.store.set('nutri_drinks', loadDrinks(c).filter((d) => d.id !== c.params.id)); return { ok: true }; } },

  /* ---- dashboard ---- */
  {
    method: 'GET', path: '/v1/dashboard', handler: (c) => {
      const date = c.query.date || localToday();
      const { meals, total } = consumedOn(c, date);
      const t = targetsOf(c);
      const fiberT = t.fiber_g ?? 30;
      const remKcal = Math.round(t.kcal - total.kcal);
      const water = waterOn(loadDrinks(c), date);
      const wt = waterTarget(c);
      const insights: string[] = [];
      if (total.protein_g < t.protein_g * 0.5 && total.kcal > 0) insights.push(`You are at ${Math.round(total.protein_g)} g of ${t.protein_g} g protein. Add paneer, dal, eggs or curd to your next meal.`);
      if (water < wt * 0.5) insights.push('Water intake is under half your goal. A glass now keeps energy steady.');
      if (remKcal > 0) insights.push(`${remKcal} kcal left today. A balanced dinner with protein and veggies fits well.`);
      else insights.push('You have reached your calorie target. Keep the rest of the day light and hydrated.');
      const plan = c.store.get<Plans>('nutri_plans', {})[date];
      const slotTypes = ['breakfast', 'lunch', 'evening_snack', 'dinner'];
      return {
        date,
        targets: { kcal: t.kcal, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, fiber_g: fiberT },
        consumed: { kcal: total.kcal, protein_g: total.protein_g, carbs_g: total.carbs_g, fat_g: total.fat_g, fiber_g: total.fiber_g },
        remaining_kcal: remKcal,
        remaining: { protein_g: r1(t.protein_g - total.protein_g), carbs_g: r1(t.carbs_g - total.carbs_g), fat_g: r1(t.fat_g - total.fat_g), fiber_g: r1(fiberT - total.fiber_g) },
        water_ml: water, water_target_ml: wt,
        meals: meals.map((m) => ({ id: m.id, meal_type: m.meal_type, kcal: mealTotal(m).kcal })),
        insights: insights.slice(0, 3),
        activity: { steps: 6240, workout_minutes: 0, sleep_hours: 7.2, active_kcal: 240 },
        meal_slots: slotTypes.map((s) => {
          const pm = plan?.meals.find((x) => x.meal_type === s);
          const r = pm ? recipeById(pm.recipe_id) : null;
          return { meal_type: s, planned: r ? { name: r.name, kcal: recipeMacros(r).kcal } : null, logged_kcal: meals.filter((m) => m.meal_type === s).reduce((a, m) => a + mealTotal(m).kcal, 0) };
        }),
      };
    },
  },

  /* ---- AI scan (canned) ---- */
  {
    method: 'POST', path: '/v1/scan', handler: (c) => {
      const lines: [string, string, number, number, string | null][] = [
        ['dal', 'f_dal', 180, 0.91, 'boiled'], ['roti', 'f_roti', 80, 0.88, 'cooked'], ['rice', 'f_rice', 150, 0.86, 'boiled'], ['mixed vegetable sabzi', 'f_alugobi', 120, 0.62, 'sauteed'],
      ];
      return {
        scan_id: 'scan_' + uid(),
        items: lines.map(([detected, fid, grams, conf, cook]) => {
          const f = FOOD_BY_ID[fid]; const n = scale(f, grams);
          return {
            detected_name: detected, grams, confidence: conf, cooking_method: cook, is_estimate: true, needs_confirmation: conf < 0.7, food_id: f.id, name: f.name,
            nutrition: { kcal: n.kcal, protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g, fiber_g: n.fiber_g }, allergen_warnings: f.allergens,
          };
        }),
        disclaimer: 'Demo mode: this is a sample result, not a real photo analysis. Portion sizes are estimates; adjust them before saving.',
        empty: false,
      };
    },
  },

  /* ---- diet planner ---- */
  {
    method: 'GET', path: '/v1/diet/plan', handler: (c) => {
      const date = c.query.date || localToday();
      let plans = c.store.get<Plans>('nutri_plans', {});
      if (!plans[date] && date === localToday() && !c.store.get<boolean>('nutri_plan_seeded', false)) {
        c.store.set('nutri_plan_seeded', true);
        generatePlan(c, date, 7);
        plans = c.store.get<Plans>('nutri_plans', {});
      }
      const p = plans[date];
      if (!p) throw new DemoError(404, 'No plan for this day');
      return { plan_id: p.plan_id, date, meals: p.meals.map((m) => planMealOut(c, m)) };
    },
  },
  {
    method: 'POST', path: '/v1/diet/generate', handler: (c) => {
      const period = c.body.period || 'daily';
      const days = period === 'monthly' ? 30 : period === 'weekly' ? 7 : 1;
      return { plan_id: generatePlan(c, c.body.start_date || localToday(), days) };
    },
  },
  {
    method: 'GET', path: '/v1/diet/shopping-list', handler: (c) => {
      const days = Math.max(1, Number(c.query.days) || 7);
      const plans = c.store.get<Plans>('nutri_plans', {});
      const dates = Object.keys(plans).filter((d) => (!c.query.plan_id || plans[d].plan_id === c.query.plan_id)).sort();
      const useDates = dates.slice(0, days);
      const by: Record<string, Record<string, number>> = {};
      for (const d of useDates) for (const m of plans[d].meals) {
        const r = recipeById(m.recipe_id)!;
        for (const i of r.ingredients) { const f = FOOD_BY_ID[i.food_id]; (by[f.category] ??= {}); by[f.category][f.name] = (by[f.category][f.name] ?? 0) + i.grams; }
      }
      return { days, groups: Object.entries(by).map(([category, items]) => ({ category, items: Object.entries(items).map(([name, grams]) => ({ name, grams: Math.round(grams) })).sort((a, b) => b.grams - a.grams) })) };
    },
  },
  {
    method: 'GET', path: '/v1/diet/recommendations', handler: (c) => {
      const date = c.query.date || localToday();
      const { rem, t, total } = remainingOn(c, date);
      const proteinLow = total.protein_g < t.protein_g * 0.6;
      const pool = [...allFoods(c)].filter((f) => f.category !== 'Supplements' && f.category !== 'Fats');
      const ranked = pool.map((f) => {
        const n = f.food_nutrition; const g = f.default_serving_g || 100; const m = scale(f, g);
        const score = (proteinLow ? m.protein_g * 3 : m.protein_g) - Math.max(0, m.kcal - Math.max(rem.kcal, 150)) / 20 + m.fiber_g;
        return { f, g, m, score, n };
      }).sort((a, b) => b.score - a.score).slice(0, 5);
      return {
        summary: rem.kcal > 0 ? `You have about ${rem.kcal} kcal and ${Math.max(0, Math.round(rem.protein_g))} g protein left today.` : 'You have reached your calorie target. Pick light, high-fibre options if you are hungry.',
        recommendations: ranked.map(({ f, g, m }) => ({
          name: f.name, grams: g, kcal: m.kcal, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, food_id: f.id,
          reason: proteinLow && m.protein_g >= 10 ? `Good protein hit (${m.protein_g} g) for what is left today.` : m.fiber_g >= 3 ? 'High in fibre to keep you full.' : 'Fits comfortably in your remaining calories.',
        })),
      };
    },
  },
  {
    method: 'PATCH', path: '/v1/diet/meals/:id', handler: (c) => {
      const { plans, meal } = findPlanMeal(c, c.params.id);
      if (c.body.scheduled_time) meal.scheduled_time = String(c.body.scheduled_time).slice(0, 5);
      c.store.set('nutri_plans', plans);
      return planMealOut(c, meal);
    },
  },
  {
    method: 'POST', path: '/v1/diet/meals/:id/replace', handler: (c) => {
      const { plans, meal } = findPlanMeal(c, c.params.id);
      const pool = slotPool(c, meal.meal_type).filter((x) => x.id !== meal.recipe_id);
      const alts = pool.slice(0, 3);
      const idx = c.body.alternative_index;
      const pick = typeof idx === 'number' && alts[idx] ? alts[idx] : pool[Math.floor(Math.random() * pool.length)] ?? recipeById(meal.recipe_id)!;
      meal.recipe_id = pick.id; meal.logged = false;
      c.store.set('nutri_plans', plans);
      return planMealOut(c, meal);
    },
  },
  {
    method: 'POST', path: '/v1/diet/meals/:id/log', handler: (c) => {
      const { plans, meal } = findPlanMeal(c, c.params.id);
      const id = addMealFromRecipe(c, recipeById(meal.recipe_id)!, c.body.log_date || localToday(), meal.meal_type);
      meal.logged = true;
      c.store.set('nutri_plans', plans);
      return { meal_id: id };
    },
  },

  /* ---- next-meal suggestion ---- */
  {
    method: 'GET', path: '/v1/suggestions/next-meal', handler: (c) => {
      const date = c.query.date || localToday();
      const hour = Number(c.query.hour) || new Date().getHours();
      const slot = slotForHour(hour);
      const { rem } = remainingOn(c, date);
      const remaining = { kcal: rem.kcal, protein_g: rem.protein_g, carbs_g: rem.carbs_g, fat_g: rem.fat_g };
      if (rem.kcal < 100) return { date, slot, message: 'You have reached your calorie target for today. Great work!', suggestions: [], remaining };
      const want = slot === 'dinner' ? 'dinner' : slot === 'lunch' ? 'lunch' : slot === 'breakfast' ? 'breakfast' : 'evening_snack';
      const budget = want === 'evening_snack' ? Math.min(rem.kcal, 300) : Math.min(rem.kcal, rem.kcal / (want === 'dinner' ? 1 : 1.5));
      const cands = slotPool(c, want).map((r) => ({ r, m: recipeMacros(r) })).sort((a, b) => Math.abs(a.m.kcal - budget) - Math.abs(b.m.kcal - budget)).slice(0, 3);
      return {
        date, slot, message: null, remaining,
        suggestions: cands.map(({ r, m }) => ({
          kind: 'recipe', id: r.id, name: r.name, serving: '1 serving', kcal: m.kcal, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g,
          reason: m.protein_g >= 20 && rem.protein_g > 20 ? `Protein-rich (${m.protein_g} g) to close your protein gap.` : `${m.kcal} kcal fits the ${rem.kcal} kcal you have left.`,
        })),
      };
    },
  },

  /* ---- recipes ---- */
  {
    method: 'GET', path: '/v1/recipes', handler: (c) => {
      const q = (c.query.q ?? '').trim().toLowerCase();
      const diet = c.query.diet;
      const list = RECIPES.filter((r) => (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)) && (!diet || r.diet_tags.includes(diet)));
      return { recipes: list.map((r) => recipeOut(c, r)) };
    },
  },
  {
    method: 'GET', path: '/v1/recipes/:id', handler: (c) => {
      const r = recipeById(c.params.id);
      if (!r) throw new DemoError(404, 'Recipe not found');
      return { recipe: recipeOut(c, r, true) };
    },
  },
];
