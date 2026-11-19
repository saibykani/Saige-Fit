# API contract (v1)

All endpoints require `Authorization: Bearer <supabase access token>` unless noted. JSON in/out.
Dates are `YYYY-MM-DD` in the **user's local calendar**; the client sends them. Errors: `{"detail": "..."}`
with 401 (auth), 402 (not in plan), 403 (consent), 409 (onboarding required), 422 (validation), 502 (upstream).
The user id is ALWAYS taken from the token. Nutrition numbers are ALWAYS computed server-side from DB records.

Already built: `POST /v1/profile/targets`, `GET /v1/foods/search?q=`, `POST /v1/scan` (multipart `image`),
`POST /v1/meals`, `GET /v1/dashboard?date=&hour=`. See `backend/app/routers/`.

## Identity, profile, consent  (backend-core)
- `GET /v1/me` → `{user:{id,email,full_name,avatar_path,privacy_consent_at,ai_consent_at}, onboarded:bool, profile|null,
  goal|null, diet|null, tier:"free|pro|premium", entitlements:[feature,...]}`
- `POST /v1/onboarding` body: `{full_name, date_of_birth, gender, country?, language?, height_cm, weight_kg,
  target_weight_kg?, body_fat_pct?, waist_cm?, goal, activity_level, sleep_hours?, experience, workout_env,
  training_days, workout_days:[1..7], workout_minutes, preferred_workout_time?("HH:MM"), equipment:[str],
  injuries:[str], diet_type, allergies:[str], intolerances:[str], restrictions:[str], liked_foods:[str],
  disliked_foods:[str], cuisines:[str], meals_per_day, monthly_budget?, privacy_consent:true, ai_consent:bool}`
  → saves everything, computes + stores targets, creates the first weight log, returns `{targets: <TargetsResponse>}`.
  Requires `privacy_consent == true` (422 otherwise).
- `PUT /v1/profile` partial update of any onboarding field above (except consents) → recomputes targets → `{targets}`.
- `POST /v1/consent` `{ai:bool}` sets/clears `ai_consent_at`.
- `GET /v1/account/export` → full JSON dump of the user's data. `DELETE /v1/account` → deletes all data + auth user (needs
  service role key server-side), body `{confirm:"DELETE"}`.

## Food (backend-core)
- `GET /v1/foods/barcode/{code}` → `{food:{id,name,brand,serving..., nutrition per 100g}}`; looks in `food_items.barcode`, else
  Open Food Facts (`https://world.openfoodfacts.org/api/v2/product/{code}.json`), validates nutrition with `validate_per_100g`,
  caches into `food_items` (source `open_food_facts`) via the backend; 404 if unknown.
- `POST /v1/foods` custom food `{name, kcal,protein_g,carbs_g,fat_g, sat_fat_g?,fiber_g?,sugar_g?,sodium_mg? (per 100g), default_serving_g?}` → food.
- `GET /v1/foods/recent` → last 20 distinct foods the user logged. `GET/POST/DELETE /v1/favorites/foods[/{food_id}]`.
- `GET /v1/meals?date=` → `{meals:[{id,meal_type,eaten_at,photo_path,items:[meal_item...],total}]}`; `DELETE /v1/meals/{id}`;
  `PATCH /v1/meals/{meal_id}/items/{item_id}` `{quantity_g}` recomputes snapshot from the food record.
- USDA FoodData Central: `GET /v1/foods/usda?q=` proxies USDA search (key server-side), maps to the same shape (not persisted
  until chosen via `POST /v1/foods/usda/import {fdc_id}`).
- Dashboard (extend existing): add `activity:{steps,workout_minutes,sleep_hours,active_kcal}` and `meal_slots` (planned vs logged).
- `POST /v1/activity` `{date, steps?, sleep_hours?}` upserts (table `daily_activity`, new migration).

## Hydration (backend-core)
- `GET /v1/hydration?date=` → `{target_ml, total_ml, water_ml, logs:[{id,amount_ml,beverage,counts_toward_goal,logged_at}]}`
- `POST /v1/hydration` `{amount_ml, beverage="water", counts_toward_goal?, log_date}` (water counts; non-water beverages
  default to `counts_toward_goal=false` unless caller overrides) · `DELETE /v1/hydration/{id}` · `GET /v1/hydration/history?days=14`
- `PUT /v1/hydration/target` `{target_ml}` (user-adjustable, 500..8000).

## Progress & analytics (backend-core)
- `POST /v1/weight` `{weight_kg, log_date}` (upsert per day; also updates profile weight + recomputes targets if latest)
  · `GET /v1/weight?days=90` → `{points:[{log_date,weight_kg}], trend_7d_avg:[...]}` · `DELETE /v1/weight/{id}`
- `POST /v1/measurements` `{log_date, waist_cm?,chest_cm?,arm_cm?,hip_cm?,thigh_cm?,body_fat_pct?}` · `GET /v1/measurements`
- `GET /v1/progress/summary?range=30|90|365` → `{start_weight,current_weight,target_weight,goal_pct, change_kg, weekly_change_kg,
  bmi, measurements_delta:{waist_cm,...}, photos_count}` (goal_pct clamped 0..100, handles gain or loss goals)
- `POST /v1/progress/photos` `{image_path (must start with "<uid>/"), angle?, taken_on}` · `GET /v1/progress/photos` →
  each with a short-lived `signed_url` (via Supabase storage sign endpoint using the user's token) · `DELETE /v1/progress/photos/{id}`
- `GET /v1/analytics/daily?date=` / `weekly?end=` / `monthly?month=YYYY-MM` → series arrays suitable for charts:
  calories, protein/carbs/fat, water, workouts, weight; plus `averages`, `adherence_pct`, `streak_days`.

## Notifications & devices (backend-core)
- `GET /v1/notifications/settings` → `{items:[{kind,enabled,time_local,weekdays,timezone}]}` (defaults created on first call for
  kinds: breakfast, lunch, dinner, hydration, workout, daily_summary, weekly_report, weigh_in) · `PUT /v1/notifications/settings`
  same shape. Reminders are scheduled **locally on device** (expo-notifications) from these settings. `POST /v1/devices/push-token {token}`.

## Subscription (backend-core)
- `GET /v1/subscription` → `{tier,status,current_period_end,entitlements:[...],plans:[{tier,features:[...]}]}` (from `plan_entitlements`).
- `POST /v1/subscription/verify` `{provider:"google|apple", receipt}` → 501 until billing creds are configured (architecture only).
- `POST /v1/subscription/dev-tier` `{tier}` ONLY when `ENVIRONMENT != production` and `ALLOW_DEV_TIER_SWITCH=true`; uses service role.

## Workouts (backend-ai)
- Exercise library seeded (`exercises` table, 70+ exercises w/ instructions, common_mistakes, contraindications, alternatives, media_url).
  `GET /v1/exercises?q=&muscle=&equipment=&difficulty=` · `GET /v1/exercises/{id}` (with alternatives expanded).
- `POST /v1/workouts/plan/generate` (deterministic engine, tier feature `personalized_workouts`; free tier gets `basic_workout_plan`
  = fixed full-body template) → `{plan}`. Respects experience, days, equipment, minutes, injuries (never includes an exercise whose
  `contraindications` intersect the user's injuries), recovery spacing, goal-based sets/reps/rest, conservative progression.
- `GET /v1/workouts/plan` → `{plan:{id,name,days:[{id,weekday,focus,is_rest,exercises:[{exercise,sets,reps,rest_s}]}]}}|null`
  · `GET /v1/workouts/today?date=` → today's day + any in-progress session · `POST /v1/workouts/days/{day_id}/replace-exercise`
  `{exercise_id, replacement_id}` (replacement must be safe for injuries).
- `POST /v1/workouts/sessions` `{day_id?, log_date}` start · `POST /v1/workouts/sessions/{id}/sets`
  `{exercise_id,set_number,reps,weight_kg,completed,skipped}` (computes `is_pr` vs history, returns it) ·
  `POST /v1/workouts/sessions/{id}/finish` → `{duration_min, kcal_burned (estimate, MET-based), completion_pct, new_prs}` ·
  `GET /v1/workouts/history?limit=` · `GET /v1/workouts/stats?weeks=8` (weekly volume, frequency, completion) · `GET /v1/workouts/prs`.

## Diet planner & recipes (backend-ai)
- `POST /v1/diet/generate` `{period:"daily|weekly|monthly", start_date}` (tier `ai_meal_suggestions`; free gets none) — deterministic
  engine over the food DB honoring diet type, allergies, restrictions, disliked foods, cuisines, meals_per_day, target kcal/macros
  (±5% kcal), workout-day carb bump. → `{plan_id}`. `GET /v1/diet/plan?date=` → meals grouped by `meal_type` with nutrition,
  `instructions`, `alternatives`, `scheduled_time`. `POST /v1/diet/meals/{id}/replace` (swap to an alternative or regenerate),
  `POST /v1/diet/meals/{id}/log` (adds to the journal), `PATCH /v1/diet/meals/{id}` `{scheduled_time?}`.
- `GET /v1/diet/shopping-list?plan_id=&days=7` → aggregated grams by food, grouped by category.
- `GET /v1/diet/recommendations?date=&hour=` → what to eat next given **remaining** kcal/macros and diet prefs (ranked foods w/ portions
  and a human reason). Example: 900/2000 kcal eaten & low protein → protein-rich picks.
- `GET /v1/recipes?q=&diet=` · `GET /v1/recipes/{id}` (seed ≥ 20 recipes: ingredients with food_id + grams, steps, computed nutrition per serving).
- Favorites for recipes/foods: `POST/DELETE /v1/favorites/recipes/{id}`.

## AI coach (backend-ai)
- `POST /v1/coach/chat` `{conversation_id?, message}` → `{conversation_id, reply, suggestions:[str]}` (tier `ai_assistant`; requires
  `ai_consent_at`). Server builds context from profile, today's journal, plan, recent weight/workouts. System prompt enforces:
  no diagnosis, no extreme restriction (<floor kcal), recommend professional care for red-flag symptoms, explain reasoning, no
  invented user data. Rate limited with `AI_LIMIT`. Model: `CHAT_MODEL`. Pre-filter: red-flag keywords short-circuit to a safety reply.
- `GET /v1/coach/conversations` · `GET /v1/coach/conversations/{id}` · `DELETE /v1/coach/conversations/{id}`.
- `GET /v1/reports/weekly?end=` (tier `weekly_ai_report`) → `{stats:{...computed from data}, summary, recommendations:[...]}`;
  stats are computed deterministically; the LLM only phrases the summary (fallback to template text if LLM unavailable).

## Mobile-only (no endpoint)
Camera/gallery capture, barcode scanning (expo-camera), image upload straight to Supabase Storage buckets
(`food-photos`, `progress-photos`, `avatars`) at `<user_id>/<uuid>.jpg`, pedometer steps (expo-sensors) → `POST /v1/activity`,
local notification scheduling, haptics, animations.
