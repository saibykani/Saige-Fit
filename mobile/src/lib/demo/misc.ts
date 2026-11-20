import { DemoError, type Ctx, type Route } from './types';
import { store, uid } from './store';

// ---------- profile / targets ----------
const DEMO_PROFILE = {
  full_name: 'Alex Demo', email: 'demo@saigefit.app', avatar_path: null,
  date_of_birth: '1994-06-15', gender: 'male', country: 'US', language: 'en',
  height_cm: 175, weight_kg: 78, target_weight_kg: 72, body_fat_pct: null, waist_cm: null,
  goal: 'lose_weight', activity_level: 'moderately_active', sleep_hours: 7, experience: 'intermediate',
  workout_env: 'gym', training_days: 4, workout_days: [1, 2, 4, 5], workout_minutes: 45, preferred_workout_time: 'evening',
  equipment: ['dumbbells', 'barbell', 'bench'], injuries: [] as string[],
  diet_type: 'non_vegetarian', allergies: [] as string[], intolerances: [] as string[], restrictions: [] as string[],
  liked_foods: [] as string[], disliked_foods: [] as string[], cuisines: [] as string[], meals_per_day: 4, monthly_budget: null,
};
type Profile = Record<string, any>;

const DIET_KEYS = ['diet_type', 'allergies', 'intolerances', 'restrictions', 'liked_foods', 'disliked_foods', 'cuisines', 'meals_per_day', 'monthly_budget'];
const ACTIVITY_MULT: Record<string, number> = { sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725, extra_active: 1.9 };

const getProfile = (c: Ctx): Profile => {
  let p = c.store.get<Profile | null>('profile', null);
  if (!p) { p = { ...DEMO_PROFILE }; c.store.set('profile', p); }
  return p;
};

function ageOf(dob?: string): number {
  const d = dob ? new Date(dob) : null;
  if (!d || isNaN(d.getTime())) return 30;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return Math.max(14, a);
}

function computeTargets(p: Profile) {
  const w = Number(p.weight_kg) || 70, h = Number(p.height_cm) || 170, age = ageOf(p.date_of_birth);
  const male = p.gender === 'male', female = p.gender === 'female';
  const base = 10 * w + 6.25 * h - 5 * age;
  const bmr = Math.round(base + (male ? 5 : female ? -161 : -78));
  const mult = ACTIVITY_MULT[p.activity_level] ?? 1.375;
  const tdee = Math.round(bmr * mult);
  const goal = p.goal ?? 'general_fitness';
  let target = tdee;
  if (/lose|fat|cut/.test(goal)) target = Math.round(tdee * 0.8);
  else if (/gain|muscle|bulk/.test(goal)) target = Math.round(tdee * 1.1);
  const floor = male ? 1500 : 1200;
  const notes: string[] = [];
  if (target < floor) { target = floor; notes.push(`Calories were raised to a safe minimum of ${floor} kcal.`); }
  const protein = Math.round(w * (/gain|muscle|bulk/.test(goal) ? 2.0 : /lose|fat|cut/.test(goal) ? 1.9 : 1.6));
  const fat = Math.round((target * 0.27) / 9);
  const carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
  const bmi = Math.round((w / ((h / 100) ** 2)) * 10) / 10;
  const bmi_category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Healthy' : bmi < 30 ? 'Overweight' : 'Obese';
  return {
    bmi, bmi_category, bmr_kcal: bmr, tdee_kcal: tdee, target_kcal: target,
    protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: Math.round((target / 1000) * 14),
    water_ml: Math.round(w * 35 / 50) * 50,
    suggested_activity: p.activity_level ?? 'lightly_active',
    notes, disclaimer: 'Estimates for healthy adults. Not medical advice.',
  };
}

/** Writes the profile + derived targets to the store (other demo modules read both keys). */
function saveProfile(c: Ctx, p: Profile) {
  const t = computeTargets(p);
  c.store.set('profile', p);
  c.store.set('profile_targets', { kcal: t.target_kcal, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, water_ml: t.water_ml });
  return t;
}

const consent = (c: Ctx) => c.store.get<{ privacy_consent_at: string | null; ai_consent_at: string | null } | null>('consent', null) ?? {
  privacy_consent_at: new Date().toISOString(), ai_consent_at: new Date().toISOString(),
};

const sub = (c: Ctx) => c.store.get<string | null>('tier', null) ?? 'premium';
const ALL_FEATURES = ['manual_food_log', 'basic_workout_plan', 'basic_progress', 'ai_food_scan', 'ai_meal_suggestions', 'personalized_workouts',
  'advanced_analytics', 'ai_assistant', 'advanced_coaching', 'weekly_ai_report', 'nutrition_insights', 'workout_analytics'];
const FREE_FEATURES = ALL_FEATURES.slice(0, 3);
const PRO_FEATURES = ALL_FEATURES.filter((f) => !['advanced_coaching', 'weekly_ai_report', 'nutrition_insights', 'workout_analytics'].includes(f));
const featuresFor = (tier: string) => (tier === 'free' ? FREE_FEATURES : tier === 'pro' ? PRO_FEATURES : ALL_FEATURES);

function me(c: Ctx) {
  const p = getProfile(c);
  c.store.get('profile_targets', null) ?? saveProfile(c, p);
  const t = computeTargets(p);
  const cs = consent(c);
  const tier = sub(c);
  const { full_name, email, avatar_path, goal, ...rest } = p;
  const profile: Profile = {
    ...rest, goal,
    target_kcal: t.target_kcal, target_protein_g: t.protein_g, target_carbs_g: t.carbs_g, target_fat_g: t.fat_g,
    target_fiber_g: t.fiber_g, target_water_ml: t.water_ml,
  };
  const diet: Profile = {};
  DIET_KEYS.forEach((k) => { diet[k] = p[k]; });
  return {
    user: { id: 'demo-user', email: email ?? 'demo@saigefit.app', full_name: full_name ?? 'Demo User', avatar_path: avatar_path ?? null, ...cs },
    onboarded: c.store.get<boolean | null>('onboarded', null) ?? true,
    profile, goal, diet, tier, entitlements: featuresFor(tier),
  };
}

function mergeProfile(c: Ctx, body: Profile): Profile {
  const p = { ...getProfile(c) };
  for (const [k, v] of Object.entries(body ?? {})) {
    if (v === undefined || k === 'privacy_consent' || k === 'ai_consent') continue;
    p[k] = v;
  }
  return p;
}

// ---------- coach ----------
type Conv = { id: string; title: string | null; created_at: string; messages: { id: string; role: 'user' | 'assistant'; content: string; created_at: string }[] };

const SAFETY: { re: RegExp; reply: string }[] = [
  { re: /\b(kill myself|suicid\w*|end my life|want to die|hurt myself|self[- ]?harm|don'?t want to live)\b/i,
    reply: "I'm really sorry you're feeling this way, and I'm glad you said something. You deserve support from a real person right now. If you might act on these thoughts, please call your local emergency number. In the US you can call or text 988; elsewhere, findahelpline.com lists free services by country. Reaching out to someone you trust today can also help. I'm here to talk about fitness whenever you're ready." },
  { re: /\b(chest (pain|pressure|tightness)|can'?t breathe|cannot breathe|trouble breathing|short(ness)? of breath|faint(ed|ing)?|passed? out|blacked? out|heart attack|stroke|seizure|coughing (up )?blood|blood in (my )?(stool|urine|vomit)|severe (pain|dizziness)|numbness in (my )?(arm|face)|irregular heartbeat|heart palpitations)\b/i,
    reply: "What you describe could be serious. Please stop exercising and get medical help right away: contact your local emergency number or go to the nearest emergency department. I can't assess symptoms, and I don't want you to wait on a chat reply." },
  { re: /\b(anorexi\w*|bulimi\w*|binge[- ]?eat\w*|purg(e|ing)|make myself (throw up|vomit)|starv(e|ing) myself|laxatives? (to|for) (lose|weight)|eating disorder|hate (eating|food)|punish myself (for|with) (eating|food))\b/i,
    reply: "Thank you for trusting me with this. I can't give diet or weight-loss advice for what you're describing, because it could make things harder. Eating disorders are real, treatable conditions, and a doctor or a registered dietitian or therapist experienced in eating concerns can help. If you're in the US, the NEDA/ANAD helplines and your doctor are good first steps; elsewhere, please contact your local health service. You don't have to handle this alone." },
  { re: /\b(water fast|dry fast|fast(ing)? for (\d+|several|a few) days|no food for (\d+|several) days|(eat|eating) nothing|zero[- ]calorie diet|starvation diet|crash diet)\b|\b(?:eat|eating|diet|limit|restrict(?:ing)?|only|consume|consuming|under|below|just|on)\b[^.?!]{0,30}?\b([1-9]\d{2})\s*(?:k?cal|calories?)\b|\b([1-9]\d{2})\s*(?:k?cal|calories?)\s*(?:a day|per day|daily|diet)\b/i,
    reply: "I can't recommend that. Eating far below your body's needs, or going without food for days, can cause muscle loss, dizziness and other health problems. As a general guide, plans shouldn't go below about 1,200-1,500 kcal per day without medical supervision, and your own target is shown in the app. I can help you build a sustainable plan with a moderate deficit and enough protein if you'd like." },
  { re: /\b(pregnan\w*|breastfeed\w*|nursing mother|insulin|metformin|diabet\w* (medication|meds|drug)|blood thinners?|warfarin|chemo\w*|dialysis|kidney (disease|failure)|heart (disease|condition|failure)|medication|prescription|my doctor (said|told))\b/i,
    reply: "Because medications, pregnancy, breastfeeding or a medical condition can change what's safe for nutrition and exercise, I can't give personalised advice here. Please check with your doctor or a registered dietitian before changing your diet or training. Once they've advised you, I'm happy to help with general meal ideas and workout structure within their guidance." },
];

const TOPICS: { re: RegExp; reply: (t: any) => string; suggestions: string[] }[] = [
  { re: /protein/i, reply: (t) => `Aim for roughly ${t.protein_g} g of protein a day, spread over 3-4 meals (25-40 g each). Good sources: eggs, Greek yogurt, chicken, fish, paneer, tofu, lentils and whey. Check the Food tab to see how today is tracking.`, suggestions: ['High-protein breakfast ideas', 'How many calories should I eat today?'] },
  { re: /calorie|kcal|how much (should )?i eat/i, reply: (t) => `Your estimated daily target is about ${t.target_kcal} kcal (${t.protein_g} g protein, ${t.carbs_g} g carbs, ${t.fat_g} g fat). Treat it as a starting point and adjust after 2-3 weeks based on how your weight trend moves.`, suggestions: ['How much protein do I need?', 'Tips for losing weight'] },
  { re: /lose weight|weight loss|fat loss|cut|lose fat|slim/i, reply: () => 'Sustainable fat loss comes from a modest calorie deficit (about 300-500 kcal below maintenance), enough protein, strength training 2-4 times a week, daily walking and 7-9 hours of sleep. Aim to lose 0.25-0.75 kg per week; faster usually costs muscle and motivation.', suggestions: ['What workout should I do today?', 'How much protein do I need?'] },
  { re: /gain|muscle|bulk|hypertrophy/i, reply: () => 'To build muscle: train each muscle group 2x a week with progressive overload, eat a small surplus (about 5-10% above maintenance), get 1.6-2.2 g protein per kg of body weight and sleep well. Add weight or reps whenever a set feels comfortable.', suggestions: ['What workout should I do today?', 'How much protein do I need?'] },
  { re: /workout|exercise|train|gym|lift|cardio|run/i, reply: () => 'A balanced week looks like 3-4 strength sessions (full body or upper/lower), 1-2 easy cardio sessions and daily steps. Warm up for 5-10 minutes, pick 4-6 main lifts, keep 1-2 reps in reserve and rest 1-3 minutes between sets. Open the Workout tab for today\'s plan.', suggestions: ['How do I stay consistent?', 'How much sleep do I need?'] },
  { re: /sleep|tired|rest|recover/i, reply: () => 'Aim for 7-9 hours. Keep a consistent schedule, avoid caffeine after mid-afternoon, dim screens an hour before bed and keep the room cool and dark. Poor sleep raises hunger and cuts recovery, so it directly affects your results.', suggestions: ['What workout should I do today?', 'How much water should I drink?'] },
  { re: /water|hydrat|drink/i, reply: (t) => `A good target for you is about ${t.water_ml} ml of fluids a day, more when it is hot or you train hard. Pale yellow urine is a simple check. Keep a bottle nearby and drink a glass with every meal.`, suggestions: ['How much sleep do I need?', 'How much protein do I need?'] },
  { re: /breakfast|lunch|dinner|snack|meal|recipe|eat/i, reply: (t) => `Build each meal around a protein source, add vegetables or fruit, a smart carb (oats, rice, potatoes, whole grains) and a little healthy fat. With about ${t.target_kcal} kcal a day, that is roughly ${Math.round(t.target_kcal / 4)} kcal per meal across 4 meals. The Recipes and Meal plan screens have ideas.`, suggestions: ['Suggest a high-protein breakfast', 'How much protein do I need?'] },
  { re: /motivat|consisten|habit|streak|lazy|quit/i, reply: () => 'Make it small and repeatable: schedule workouts like appointments, set a minimum version (10 minutes counts), log meals right after eating and celebrate streaks. Consistency beats intensity; missing one day is fine, missing two is the habit to avoid.', suggestions: ['What workout should I do today?', 'Tips for losing weight'] },
];
const FALLBACK = "I'm your demo fitness coach. I can help with nutrition, protein and calorie targets, workouts, sleep, hydration and building habits. This is general guidance, not medical advice. What would you like to know?";
const STARTERS = ['How many calories should I eat today?', 'What workout should I do today?', 'How much protein do I need?', 'Tips for losing weight'];

function coachReply(message: string, c: Ctx): { reply: string; suggestions: string[] } {
  for (const s of SAFETY) if (s.re.test(message)) return { reply: s.reply, suggestions: [] };
  const t = computeTargets(getProfile(c));
  for (const topic of TOPICS) if (topic.re.test(message)) return { reply: topic.reply(t), suggestions: topic.suggestions };
  return { reply: FALLBACK, suggestions: STARTERS };
}

const convs = (c: Ctx) => c.store.get<Conv[] | null>('coach_convs', null) ?? [];
const notifs = (c: Ctx) => c.store.get<any[] | null>('notif_settings', null) ?? DEFAULT_NOTIFS;

const DEFAULT_NOTIFS = [
  ['breakfast', '08:00'], ['lunch', '13:00'], ['dinner', '19:30'], ['hydration', '11:00'], ['workout', '18:00'],
  ['daily_summary', '21:00'], ['weekly_report', '09:00'], ['weigh_in', '07:30'],
].map(([kind, time]) => ({ kind, enabled: false, time_local: time, weekdays: [1, 2, 3, 4, 5, 6, 7], timezone: 'UTC' }));

const DATA_KEYS = ['profile', 'profile_targets', 'onboarded', 'consent', 'tier', 'notif_settings', 'coach_convs', 'push_token'];

export const miscRoutes: Route[] = [
  { method: 'GET', path: '/v1/me', handler: (c) => me(c) },
  { method: 'GET', path: '/v1/profile', handler: (c) => ({ ...getProfile(c), targets: computeTargets(getProfile(c)) }) },
  ...(['PUT', 'PATCH'] as const).map((method): Route => ({
    method, path: '/v1/profile',
    handler: (c) => ({ targets: saveProfile(c, mergeProfile(c, c.body)) }),
  })),
  {
    method: 'GET', path: '/v1/profile/targets',
    handler: (c) => saveProfile(c, getProfile(c)),
  },
  {
    // used for live previews (edit profile / onboarding summary) with a body; does not persist
    method: 'POST', path: '/v1/profile/targets',
    handler: (c) => computeTargets({ ...getProfile(c), ...(c.body ?? {}) }),
  },
  {
    method: 'POST', path: '/v1/onboarding',
    handler: (c) => {
      const b = c.body ?? {};
      const p = mergeProfile(c, b);
      const now = new Date().toISOString();
      const cur = consent(c);
      c.store.set('consent', { privacy_consent_at: b.privacy_consent ? now : cur.privacy_consent_at, ai_consent_at: b.ai_consent ? now : null });
      c.store.set('onboarded', true);
      return { ok: true, targets: saveProfile(c, p) };
    },
  },
  { method: 'GET', path: '/v1/consent', handler: (c) => { const k = consent(c); return { privacy: !!k.privacy_consent_at, ai: !!k.ai_consent_at, ...k }; } },
  {
    method: 'POST', path: '/v1/consent',
    handler: (c) => {
      const k = consent(c), now = new Date().toISOString(), b = c.body ?? {};
      const next = {
        privacy_consent_at: b.privacy === true ? now : k.privacy_consent_at,
        ai_consent_at: b.ai === true ? (k.ai_consent_at ?? now) : b.ai === false ? null : k.ai_consent_at,
      };
      c.store.set('consent', next);
      return { privacy: !!next.privacy_consent_at, ai: !!next.ai_consent_at, ...next };
    },
  },
  { method: 'GET', path: '/v1/notifications/settings', handler: (c) => ({ items: notifs(c) }) },
  {
    method: 'PUT', path: '/v1/notifications/settings',
    handler: (c) => {
      const items = Array.isArray(c.body?.items) ? c.body.items : [];
      c.store.set('notif_settings', items);
      return { items };
    },
  },
  {
    method: 'GET', path: '/v1/subscription',
    handler: (c) => {
      const tier = sub(c);
      return {
        tier, status: 'active', current_period_end: null, entitlements: featuresFor(tier),
        plans: [
          { tier: 'free', features: FREE_FEATURES },
          { tier: 'pro', features: PRO_FEATURES },
          { tier: 'premium', features: ALL_FEATURES },
        ],
      };
    },
  },
  {
    method: 'POST', path: '/v1/subscription/dev-tier',
    handler: (c) => {
      const tier = ['free', 'pro', 'premium'].includes(c.body?.tier) ? c.body.tier : 'premium';
      c.store.set('tier', tier);
      return { tier };
    },
  },
  { method: 'POST', path: '/v1/devices/push-token', handler: (c) => { c.store.set('push_token', c.body?.token ?? null); return { ok: true }; } },
  {
    method: 'GET', path: '/v1/coach/conversations',
    handler: (c) => ({
      conversations: convs(c).map(({ id, title, created_at }) => ({ id, title, created_at }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }),
  },
  {
    method: 'POST', path: '/v1/coach/conversations',
    handler: (c) => {
      const conv: Conv = { id: uid(), title: c.body?.title ?? null, created_at: new Date().toISOString(), messages: [] };
      c.store.set('coach_convs', [...convs(c), conv]);
      return { id: conv.id, title: conv.title, created_at: conv.created_at };
    },
  },
  {
    method: 'GET', path: '/v1/coach/conversations/:id',
    handler: (c) => {
      const conv = convs(c).find((x) => x.id === c.params.id);
      if (!conv) throw new DemoError(404, 'Conversation not found');
      return conv;
    },
  },
  {
    method: 'DELETE', path: '/v1/coach/conversations/:id',
    handler: (c) => { c.store.set('coach_convs', convs(c).filter((x) => x.id !== c.params.id)); return { ok: true }; },
  },
  {
    method: 'POST', path: '/v1/coach/chat',
    handler: (c) => {
      const message = String(c.body?.message ?? '').trim();
      if (!message) throw new DemoError(422, 'Message is required');
      const all = convs(c);
      let conv = c.body?.conversation_id ? all.find((x) => x.id === c.body.conversation_id) : undefined;
      if (!conv) {
        conv = { id: uid(), title: message.slice(0, 48), created_at: new Date().toISOString(), messages: [] };
        all.push(conv);
      }
      const { reply, suggestions } = coachReply(message, c);
      const now = new Date().toISOString();
      conv.messages.push({ id: uid(), role: 'user', content: message, created_at: now }, { id: uid(), role: 'assistant', content: reply, created_at: now });
      c.store.set('coach_convs', all);
      return { conversation_id: conv.id, reply, suggestions };
    },
  },
  {
    method: 'GET', path: '/v1/account/export',
    handler: (c) => {
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), note: 'Demo data stored on this device only.' };
      out.me = me(c);
      out.coach_conversations = convs(c);
      out.notification_settings = notifs(c);
      return out;
    },
  },
  {
    method: 'DELETE', path: '/v1/account',
    handler: (c) => {
      // clears this module's data; profile is re-seeded with the demo user on next use
      DATA_KEYS.forEach((k) => c.store.set(k, null));
      c.store.set('onboarded', true);
      return { ok: true };
    },
  },
];
