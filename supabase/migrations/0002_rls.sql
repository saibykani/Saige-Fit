-- Row-level security: every private table is owner-only.
do $$
declare t text;
begin
  -- tables with a direct user_id column
  foreach t in array array[
    'user_profiles','fitness_goals','dietary_preferences','food_scans','meal_logs',
    'diet_plans','workout_plans','workout_sessions','hydration_logs','weight_logs',
    'body_measurements','progress_photos','notifications','user_favorites','ai_conversations'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_owner', t);
  end loop;
end $$;

alter table users enable row level security;
create policy users_self_read   on users for select using (id = auth.uid());
create policy users_self_update on users for update using (id = auth.uid()) with check (id = auth.uid());

-- subscriptions are read-only to clients; only the backend (service role) writes them
alter table subscriptions enable row level security;
create policy subscriptions_read on subscriptions for select using (user_id = auth.uid());

-- children owned via parent
alter table meal_items enable row level security;
create policy meal_items_owner on meal_items for all
  using (exists (select 1 from meal_logs m where m.id = meal_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meal_logs m where m.id = meal_id and m.user_id = auth.uid()));

alter table diet_plan_meals enable row level security;
create policy diet_plan_meals_owner on diet_plan_meals for all
  using (exists (select 1 from diet_plans p where p.id = plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from diet_plans p where p.id = plan_id and p.user_id = auth.uid()));

alter table workout_days enable row level security;
create policy workout_days_owner on workout_days for all
  using (exists (select 1 from workout_plans p where p.id = plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from workout_plans p where p.id = plan_id and p.user_id = auth.uid()));

alter table workout_sets enable row level security;
create policy workout_sets_owner on workout_sets for all
  using (exists (select 1 from workout_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from workout_sessions s where s.id = session_id and s.user_id = auth.uid()));

alter table ai_messages enable row level security;
create policy ai_messages_owner on ai_messages for all
  using (exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- shared reference data: readable by any signed-in user; custom foods only by owner
alter table food_items enable row level security;
create policy food_items_read  on food_items for select using (owner_id is null or owner_id = auth.uid());
create policy food_items_write on food_items for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table food_nutrition enable row level security;
create policy food_nutrition_read on food_nutrition for select
  using (exists (select 1 from food_items f where f.id = food_id and (f.owner_id is null or f.owner_id = auth.uid())));
create policy food_nutrition_write on food_nutrition for all
  using (exists (select 1 from food_items f where f.id = food_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from food_items f where f.id = food_id and f.owner_id = auth.uid()));

alter table exercises enable row level security;
create policy exercises_read on exercises for select using (auth.uid() is not null);

alter table plan_entitlements enable row level security;
create policy entitlements_read on plan_entitlements for select using (auth.uid() is not null);

-- ---------- private storage buckets, path convention: <user_id>/<file> ----------
insert into storage.buckets (id, name, public) values
  ('food-photos','food-photos',false),
  ('progress-photos','progress-photos',false),
  ('avatars','avatars',false)
on conflict do nothing;

do $$
declare b text;
begin
  foreach b in array array['food-photos','progress-photos','avatars'] loop
    execute format($f$create policy %I on storage.objects for all
      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$,
      b||'_owner', b, b);
  end loop;
end $$;

-- default entitlements (configurable data, edit without redeploying)
insert into plan_entitlements(tier, feature, limit_per_day) values
  ('free','manual_food_log',null),('free','basic_workout_plan',null),('free','basic_progress',null),
  ('pro','manual_food_log',null),('pro','ai_food_scan',null),('pro','ai_meal_suggestions',null),
  ('pro','personalized_workouts',null),('pro','advanced_analytics',null),('pro','ai_assistant',null),
  ('premium','manual_food_log',null),('premium','ai_food_scan',null),('premium','ai_meal_suggestions',null),
  ('premium','personalized_workouts',null),('premium','advanced_analytics',null),('premium','ai_assistant',null),
  ('premium','advanced_coaching',null),('premium','weekly_ai_report',null),('premium','nutrition_insights',null),
  ('premium','workout_analytics',null)
on conflict do nothing;
