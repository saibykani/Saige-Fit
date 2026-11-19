-- Core extras: daily activity (steps, sleep), user-adjustable water target, notification kind
-- validation and unique keys for imported foods.

create table daily_activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  log_date    date not null,
  steps       integer check (steps between 0 and 200000),
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  updated_at  timestamptz not null default now(),
  unique (user_id, log_date)
);
create index daily_activity_user_date on daily_activity(user_id, log_date);

alter table daily_activity enable row level security;
create policy daily_activity_owner on daily_activity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- true once the user set their own hydration target; recalculation must then leave it alone
alter table user_profiles add column water_target_custom boolean not null default false;

alter table notifications add constraint notifications_kind_chk check (kind in
  ('breakfast','lunch','dinner','hydration','workout','daily_summary','weekly_report','weigh_in'));
alter table notifications add constraint notifications_weekdays_chk check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]);

-- one shared catalog row per USDA food
create unique index food_items_usda_uq on food_items(source_ref)
  where source = 'usda' and owner_id is null;
