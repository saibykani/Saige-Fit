-- Recipes + recipe favorites. (Exercises, workout and diet plan tables already exist in 0001.)
create table recipes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  cuisine       text,
  description   text,
  servings      smallint not null default 1 check (servings between 1 and 20),
  prep_minutes  smallint check (prep_minutes >= 0),
  cook_minutes  smallint check (cook_minutes >= 0),
  tags          text[] not null default '{}',
  steps         text[] not null default '{}',
  image_url     text,
  created_at    timestamptz not null default now()
);
create index recipes_name_trgm on recipes using gin (name gin_trgm_ops);

-- grams are of the referenced food as eaten (cooked/prepared); nutrition is computed from the food record
create table recipe_ingredients (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  food_id   uuid not null references food_items(id) on delete restrict,
  grams     numeric(7,1) not null check (grams > 0 and grams <= 5000),
  note      text,
  position  smallint not null default 0
);
create index recipe_ingredients_recipe on recipe_ingredients(recipe_id);

alter table recipes enable row level security;
create policy recipes_read on recipes for select using (auth.uid() is not null);
alter table recipe_ingredients enable row level security;
create policy recipe_ingredients_read on recipe_ingredients for select using (auth.uid() is not null);

-- favorites: allow recipes alongside foods / exercises (exactly one target per row)
alter table user_favorites add column recipe_id uuid references recipes(id) on delete cascade;
alter table user_favorites drop constraint user_favorites_check;
alter table user_favorites add constraint user_favorites_one_target
  check ((food_id is not null)::int + (exercise_id is not null)::int + (recipe_id is not null)::int = 1);
create unique index fav_recipe_uq on user_favorites(user_id, recipe_id) where recipe_id is not null;

-- diet plan rows: one row per food item; items of one meal share (plan_id, plan_date, meal_type)
create index diet_plans_user_start on diet_plans(user_id, start_date desc);
create index workout_plans_user_active on workout_plans(user_id) where is_active;
