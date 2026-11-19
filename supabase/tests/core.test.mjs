import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const sql = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');

// --- minimal Supabase stubs (same as rls.test.mjs) ---
await db.exec(`
  create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select string_to_array(name, '/') $$;
`);
for (const f of ['0001_schema.sql', '0002_rls.sql', '0003_seed_foods.sql', '0004_core_extras.sql']) await db.exec(sql(f));
await db.exec(`grant usage on schema public, auth, storage to authenticated;
  grant all on all tables in schema public to authenticated;
  grant select on all tables in schema storage to authenticated;`);

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('ok  -', name); };
const as = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub','${uid}',false)`);
  try { return await fn(); } finally { await db.exec('reset role'); }
};

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${A}','a@x.com'),('${B}','b@x.com')`);

// ---------- daily_activity ----------
await as(A, () => db.exec(`insert into daily_activity(user_id,log_date,steps,sleep_hours) values ('${A}','2026-03-01',5000,7.5)`));
await as(B, () => db.exec(`insert into daily_activity(user_id,log_date,steps) values ('${B}','2026-03-01',9000)`));

await t('daily_activity: users only see their own rows', async () => {
  const r = await as(A, () => db.query('select user_id, steps from daily_activity'));
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].user_id, A); assert.equal(r.rows[0].steps, 5000);
});
await t('daily_activity: cannot insert for another user', async () => {
  await assert.rejects(as(A, () => db.exec(`insert into daily_activity(user_id,log_date,steps) values ('${B}','2026-03-02',1)`)));
});
await t('daily_activity: cannot update or delete another user\'s row (0 rows affected)', async () => {
  await as(A, () => db.exec(`update daily_activity set steps = 1 where user_id = '${B}'`));
  await as(A, () => db.exec(`delete from daily_activity where user_id = '${B}'`));
  const r = await db.query(`select steps from daily_activity where user_id = '${B}'`);
  assert.equal(r.rows[0].steps, 9000);
});
await t('daily_activity: one row per user per day', async () => {
  await assert.rejects(as(A, () => db.exec(`insert into daily_activity(user_id,log_date,steps) values ('${A}','2026-03-01',1)`)));
});
await t('daily_activity: upsert merges only provided columns (steps kept when sleep is logged)', async () => {
  await as(A, () => db.exec(`insert into daily_activity(user_id,log_date,sleep_hours) values ('${A}','2026-03-01',6.5)
    on conflict (user_id,log_date) do update set sleep_hours = excluded.sleep_hours`));
  const r = await as(A, () => db.query(`select steps, sleep_hours from daily_activity`));
  assert.equal(r.rows[0].steps, 5000); assert.equal(Number(r.rows[0].sleep_hours), 6.5);
});
await t('daily_activity: check constraints reject absurd values', async () => {
  // control: the same statement shape with valid values succeeds, so the rejections below are the constraints
  await as(A, () => db.exec(`insert into daily_activity(user_id,log_date,steps, sleep_hours) values ('${A}','2026-04-30',100,5)`));
  for (const v of ["steps, sleep_hours) values ('x','2026-04-01',-1,5", "steps, sleep_hours) values ('x','2026-04-01',200001,5",
                   "steps, sleep_hours) values ('x','2026-04-01',100,25"]) {
    await assert.rejects(as(A, () => db.exec(`insert into daily_activity(user_id,log_date,${v.replace("'x'", `'${A}'`)})`)));
  }
});
await t('daily_activity: deleting the user cascades', async () => {
  await db.exec(`insert into auth.users values ('33333333-3333-3333-3333-333333333333','c@x.com')`);
  await db.exec(`insert into daily_activity(user_id,log_date,steps) values ('33333333-3333-3333-3333-333333333333','2026-03-01',1)`);
  await db.exec(`delete from users where id = '33333333-3333-3333-3333-333333333333'`);
  const r = await db.query(`select count(*)::int c from daily_activity where user_id = '33333333-3333-3333-3333-333333333333'`);
  assert.equal(r.rows[0].c, 0);
});

// ---------- user_profiles.water_target_custom ----------
await as(A, () => db.exec(`insert into user_profiles(user_id,date_of_birth,height_cm,weight_kg) values ('${A}','1995-05-01',180,80)`));
await t('water_target_custom defaults to false and is user-updatable only on own profile', async () => {
  let r = await as(A, () => db.query('select water_target_custom w from user_profiles'));
  assert.equal(r.rows[0].w, false);
  await as(A, () => db.exec(`update user_profiles set target_water_ml = 3500, water_target_custom = true where user_id = '${A}'`));
  r = await as(A, () => db.query('select water_target_custom w, target_water_ml m from user_profiles'));
  assert.deepEqual(r.rows[0], { w: true, m: 3500 });
  assert.equal((await as(B, () => db.query('select * from user_profiles'))).rows.length, 0);
});

// ---------- notifications constraints ----------
await t('notifications: kind and weekdays are validated, one row per kind', async () => {
  await as(A, () => db.exec(`insert into notifications(user_id,kind,time_local,weekdays) values ('${A}','breakfast','08:00',array[1,2,3]::smallint[])`));
  await assert.rejects(as(A, () => db.exec(`insert into notifications(user_id,kind) values ('${A}','spam')`)));
  await assert.rejects(as(A, () => db.exec(`insert into notifications(user_id,kind,weekdays) values ('${A}','lunch',array[0]::smallint[])`)));
  await assert.rejects(as(A, () => db.exec(`insert into notifications(user_id,kind,weekdays) values ('${A}','lunch',array[8]::smallint[])`)));
  await assert.rejects(as(A, () => db.exec(`insert into notifications(user_id,kind) values ('${A}','breakfast')`)));
  assert.equal((await as(B, () => db.query('select * from notifications'))).rows.length, 0);
});
await t('notifications: upsert on (user_id,kind) updates in place', async () => {
  await as(A, () => db.exec(`insert into notifications(user_id,kind,time_local,enabled) values ('${A}','breakfast','07:00',false)
    on conflict (user_id,kind) do update set time_local = excluded.time_local, enabled = excluded.enabled`));
  const r = await as(A, () => db.query(`select enabled, time_local::text t from notifications where kind='breakfast'`));
  assert.equal(r.rows.length, 1); assert.deepEqual(r.rows[0], { enabled: false, t: '07:00:00' });
});

// ---------- imported foods ----------
await t('food_items: one shared USDA row per fdc id; per-user private copies are allowed', async () => {
  await db.exec(`insert into food_items(name,source,source_ref) values ('Banana','usda','11')`);
  await assert.rejects(db.exec(`insert into food_items(name,source,source_ref) values ('Banana again','usda','11')`));
  await db.exec(`insert into food_items(name,source,source_ref,owner_id) values ('My banana','usda','11','${A}')`);
  await db.exec(`insert into food_items(name,source,source_ref,owner_id) values ('Their banana','usda','11','${B}')`);
});
await t('food_items: barcode caching - shared unique, private copies per user', async () => {
  await db.exec(`insert into food_items(name,source,barcode) values ('Bar','open_food_facts','5449000000996')`);
  await assert.rejects(db.exec(`insert into food_items(name,source,barcode) values ('Bar 2','open_food_facts','5449000000996')`));
  await db.exec(`insert into food_items(name,source,barcode,owner_id) values ('Bar mine','open_food_facts','5449000000996','${A}')`);
});
await t('RLS: user-created foods are private, shared catalog readable, cannot write shared rows', async () => {
  const b = await as(B, () => db.query(`select name from food_items where source = 'usda' order by name`));
  assert.deepEqual(b.rows.map((r) => r.name), ['Banana', 'Their banana']);
  await assert.rejects(as(A, () => db.exec(`insert into food_items(name,source,source_ref) values ('Fake shared','usda','99')`)));
});

// ---------- cascade for account deletion ----------
await t('deleting a user removes every owned row (account deletion contract)', async () => {
  const U = '44444444-4444-4444-4444-444444444444';
  await db.exec(`insert into auth.users values ('${U}','d@x.com')`);
  await db.exec(`insert into user_profiles(user_id,date_of_birth,height_cm,weight_kg) values ('${U}','1990-01-01',170,70)`);
  await db.exec(`insert into weight_logs(user_id,weight_kg,log_date) values ('${U}',70,'2026-01-01')`);
  await db.exec(`insert into hydration_logs(user_id,amount_ml,log_date) values ('${U}',250,'2026-01-01')`);
  await db.exec(`insert into notifications(user_id,kind) values ('${U}','lunch')`);
  await db.exec(`insert into food_items(name,owner_id) values ('Custom','${U}')`);
  await db.exec(`insert into meal_logs(user_id,meal_type,log_date) values ('${U}','lunch','2026-01-01')`);
  await db.exec(`delete from auth.users where id = '${U}'`);
  for (const tbl of ['users', 'user_profiles', 'weight_logs', 'hydration_logs', 'notifications', 'meal_logs', 'subscriptions']) {
    const col = tbl === 'users' ? 'id' : 'user_id';
    const r = await db.query(`select count(*)::int c from ${tbl} where ${col} = '${U}'`);
    assert.equal(r.rows[0].c, 0, tbl);
  }
  assert.equal((await db.query(`select count(*)::int c from food_items where owner_id = '${U}'`)).rows[0].c, 0);
});

console.log(`\n${pass} core DB tests passed`);
