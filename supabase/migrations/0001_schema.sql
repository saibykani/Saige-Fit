-- Saige Fit: core schema. Auth users live in Supabase's auth.users; `users` mirrors them.
create extension if not exists pg_trgm;

-- ---------- enums ----------
create type gender_t        as enum ('male','female','other','unspecified');
create type goal_t          as enum ('weight_loss','fat_loss','muscle_gain','lean_muscle','maintenance','strength','general_fitness','recomposition');
create type activity_t      as enum ('sedentary','lightly_active','moderately_active','very_active','extremely_active');
create type diet_t          as enum ('vegetarian','vegan','eggetarian','non_vegetarian','pescatarian');
create type experience_t    as enum ('beginner','intermediate','advanced');
create type workout_env_t   as enum ('gym','home','outdoor','gym_home');
create type meal_type_t     as enum ('early_morning','breakfast','mid_morning','lunch','evening_snack','dinner','snack');
create type plan_tier_t     as enum ('free','pro','premium');
create type nutrition_src_t as enum ('curated','usda','open_food_facts','user','ai_estimate');

-- ---------- identity ----------
create table users (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  full_name        text,
  avatar_path      text,
  privacy_consent_at timestamptz,
  ai_consent_at    timestamptz,       -- consent to AI processing of food/profile data
  expo_push_token  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table user_profiles (
  user_id          uuid primary key references users(id) on delete cascade,
  date_of_birth    date not null,
  gender           gender_t not null default 'unspecified',
  country          text,
  language         text not null default 'en',
  height_cm        numeric(5,1) not null check (height_cm between 80 and 250),
  weight_kg        numeric(5,1) not null check (weight_kg between 25 and 400),
  target_weight_kg numeric(5,1) check (target_weight_kg between 25 and 400),
  body_fat_pct     numeric(4,1) check (body_fat_pct between 2 and 70),
  waist_cm         numeric(5,1) check (waist_cm between 30 and 250),
  activity_level   activity_t not null default 'lightly_active',
  sleep_hours      numeric(3,1) check (sleep_hours between 2 and 14),
  workout_env      workout_env_t not null default 'gym',
  experience       experience_t not null default 'beginner',
  training_days    smallint not null default 3 check (training_days between 1 and 7),
  workout_minutes  smallint not null default 45 check (workout_minutes between 10 and 180),
  workout_days     smallint[] not null default '{}',        -- 1=Mon..7=Sun
  preferred_workout_time time,
  equipment        text[] not null default '{}',
  injuries         text[] not null default '{}',
  units            text not null default 'metric',
  theme            text not null default 'dark',
  -- computed targets (written by backend, never trusted from client)
  bmi              numeric(4,1),
  bmr_kcal         integer,
  tdee_kcal        integer,
  target_kcal      integer,
  target_protein_g integer,
  target_carbs_g   integer,
  target_fat_g     integer,
  target_fiber_g   integer,
  target_water_ml  integer,
  updated_at       timestamptz not null default now()
);

create table fitness_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  goal        goal_t not null,
  is_primary  boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index fitness_goals_one_primary on fitness_goals(user_id) where is_primary;

create table dietary_preferences (
  user_id         uuid primary key references users(id) on delete cascade,
  diet_type       diet_t not null default 'non_vegetarian',
  allergies       text[] not null default '{}',
  intolerances    text[] not null default '{}',
  restrictions    text[] not null default '{}',
  liked_foods     text[] not null default '{}',
  disliked_foods  text[] not null default '{}',
  cuisines        text[] not null default '{indian}',
  meals_per_day   smallint not null default 4 check (meals_per_day between 2 and 7),
  monthly_budget  numeric(10,2) check (monthly_budget >= 0),
  updated_at      timestamptz not null default now()
);

-- ---------- food ----------
create table food_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_local  text,
  brand       text,
  barcode     text,
  source      nutrition_src_t not null default 'curated',
  source_ref  text,                         -- e.g. USDA fdcId
  cuisine     text,
  diet_tags   diet_t[] not null default '{}', -- diets this food is compatible with
  allergens   text[] not null default '{}',
  default_serving_g numeric(7,1) not null default 100,
  serving_label text,                       -- e.g. "1 idli", "1 katori"
  grams_per_unit numeric(7,1),
  owner_id    uuid references users(id) on delete cascade,  -- non-null => custom user food
  created_at  timestamptz not null default now()
);
create index food_items_name_trgm on food_items using gin (name gin_trgm_ops);
create unique index food_items_barcode_uq on food_items(barcode) where barcode is not null and owner_id is null;
create index food_items_owner on food_items(owner_id);

-- nutrition values are stored PER 100 g
create table food_nutrition (
  food_id      uuid primary key references food_items(id) on delete cascade,
  kcal         numeric(7,2) not null check (kcal >= 0),
  protein_g    numeric(6,2) not null check (protein_g >= 0),
  carbs_g      numeric(6,2) not null check (carbs_g >= 0),
  fat_g        numeric(6,2) not null check (fat_g >= 0),
  sat_fat_g    numeric(6,2) check (sat_fat_g >= 0),
  fiber_g      numeric(6,2) check (fiber_g >= 0),
  sugar_g      numeric(6,2) check (sugar_g >= 0),
  sodium_mg    numeric(8,2) check (sodium_mg >= 0)
);

create table food_scans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  image_path    text,
  status        text not null default 'pending' check (status in ('pending','processing','done','failed')),
  model         text,
  raw_result    jsonb,             -- structured vision output (identification only)
  error         text,
  created_at    timestamptz not null default now()
);
create index food_scans_user_created on food_scans(user_id, created_at desc);

create table meal_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  meal_type   meal_type_t not null,
  eaten_at    timestamptz not null default now(),
  log_date    date not null,                     -- user-local date, set by client/server
  scan_id     uuid references food_scans(id) on delete set null,
  photo_path  text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index meal_logs_user_date on meal_logs(user_id, log_date);

-- snapshot of computed nutrition so history stays stable if food data changes
create table meal_items (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid not null references meal_logs(id) on delete cascade,
  food_id     uuid references food_items(id) on delete set null,
  name        text not null,
  quantity_g  numeric(7,1) not null check (quantity_g > 0 and quantity_g <= 5000),
  kcal        numeric(7,1) not null,
  protein_g   numeric(6,1) not null,
  carbs_g     numeric(6,1) not null,
  fat_g       numeric(6,1) not null,
  sat_fat_g   numeric(6,1),
  fiber_g     numeric(6,1),
  sugar_g     numeric(6,1),
  sodium_mg   numeric(8,1),
  is_estimate boolean not null default false,
  user_edited boolean not null default false
);
create index meal_items_meal on meal_items(meal_id);

create table diet_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  period      text not null check (period in ('daily','weekly','monthly')),
  start_date  date not null,
  target_kcal integer not null,
  generated_by text not null default 'ai',
  created_at  timestamptz not null default now()
);
create table diet_plan_meals (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references diet_plans(id) on delete cascade,
  plan_date   date not null,
  meal_type   meal_type_t not null,
  food_id     uuid references food_items(id) on delete set null,
  name        text not null,
  quantity_g  numeric(7,1) not null,
  kcal numeric(7,1) not null, protein_g numeric(6,1) not null, carbs_g numeric(6,1) not null, fat_g numeric(6,1) not null,
  instructions text,
  alternatives jsonb not null default '[]',
  scheduled_time time
);
create index diet_plan_meals_plan on diet_plan_meals(plan_id, plan_date);

-- ---------- workouts ----------
create table exercises (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  muscle_group text not null,
  secondary_muscles text[] not null default '{}',
  equipment    text[] not null default '{}',
  difficulty   experience_t not null default 'beginner',
  instructions text[] not null default '{}',
  common_mistakes text[] not null default '{}',
  contraindications text[] not null default '{}',   -- injury tags used to exclude exercises
  alternative_ids uuid[] not null default '{}',
  media_url    text,
  is_compound  boolean not null default false
);

create table workout_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  generated_by text not null default 'engine',
  created_at  timestamptz not null default now()
);
create table workout_days (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references workout_plans(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),
  focus       text not null,
  is_rest     boolean not null default false,
  exercises   jsonb not null default '[]',  -- [{exercise_id, sets, reps, rest_s}]
  unique (plan_id, weekday)
);

create table workout_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  day_id      uuid references workout_days(id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  log_date    date not null,
  kcal_burned integer,
  notes       text
);
create index workout_sessions_user_date on workout_sessions(user_id, log_date);

create table workout_sets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_number  smallint not null check (set_number > 0),
  reps        smallint check (reps between 0 and 500),
  weight_kg   numeric(6,2) check (weight_kg between 0 and 1000),
  completed   boolean not null default false,
  skipped     boolean not null default false,
  is_pr       boolean not null default false
);
create index workout_sets_session on workout_sets(session_id);
create index workout_sets_exercise on workout_sets(exercise_id);

-- ---------- tracking ----------
create table hydration_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  amount_ml integer not null check (amount_ml between 1 and 5000),
  beverage  text not null default 'water',
  counts_toward_goal boolean not null default true,
  logged_at timestamptz not null default now(),
  log_date  date not null
);
create index hydration_user_date on hydration_logs(user_id, log_date);

create table weight_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  weight_kg numeric(5,1) not null check (weight_kg between 25 and 400),
  log_date  date not null,
  unique (user_id, log_date)
);

create table body_measurements (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  log_date  date not null,
  waist_cm numeric(5,1), chest_cm numeric(5,1), arm_cm numeric(5,1),
  hip_cm numeric(5,1), thigh_cm numeric(5,1), body_fat_pct numeric(4,1),
  unique (user_id, log_date)
);

create table progress_photos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  image_path text not null,
  angle     text check (angle in ('front','side','back')),
  taken_on  date not null,
  created_at timestamptz not null default now()
);

-- ---------- engagement / platform ----------
create table notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  kind      text not null,   -- breakfast, lunch, dinner, hydration, workout, daily_summary, weekly_report, weigh_in
  enabled   boolean not null default true,
  time_local time,
  weekdays  smallint[] not null default '{1,2,3,4,5,6,7}',
  timezone  text not null default 'UTC',
  unique (user_id, kind)
);

create table user_favorites (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  food_id   uuid references food_items(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((food_id is not null)::int + (exercise_id is not null)::int = 1)
);
create unique index fav_food_uq on user_favorites(user_id, food_id) where food_id is not null;
create unique index fav_ex_uq on user_favorites(user_id, exercise_id) where exercise_id is not null;

-- entitlements are configuration, not code: prices live in the store, not here
create table plan_entitlements (
  tier     plan_tier_t not null,
  feature  text not null,
  limit_per_day integer,          -- null = unlimited
  primary key (tier, feature)
);

create table subscriptions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  tier      plan_tier_t not null default 'free',
  provider  text check (provider in ('apple','google','stripe','manual')),
  provider_ref text,
  status    text not null default 'active' check (status in ('active','trialing','past_due','canceled','expired')),
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);
create index subscriptions_user on subscriptions(user_id);

create table ai_conversations (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  title     text,
  created_at timestamptz not null default now()
);
create table ai_messages (
  id        uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role      text not null check (role in ('user','assistant')),
  content   text not null,
  created_at timestamptz not null default now()
);
create index ai_messages_conv on ai_messages(conversation_id, created_at);

-- ---------- trigger: mirror auth.users ----------
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users(id, email) values (new.id, new.email) on conflict do nothing;
  insert into public.subscriptions(user_id, tier) values (new.id, 'free');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_auth_user();
