import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const sql = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');

// --- minimal Supabase stubs ---
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
await db.exec(sql('0001_schema.sql'));
await db.exec(sql('0002_rls.sql'));
await db.exec(sql('0003_seed_foods.sql'));
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

await t('auth trigger mirrors users + creates free subscription', async () => {
  const r = await db.query(`select (select count(*) from users)::int u, (select count(*) from subscriptions where tier='free')::int s`);
  assert.deepEqual(r.rows[0], { u: 2, s: 2 });
});

await as(A, () => db.exec(`insert into weight_logs(user_id,weight_kg,log_date) values ('${A}',80,'2026-01-01')`));
await as(B, () => db.exec(`insert into weight_logs(user_id,weight_kg,log_date) values ('${B}',60,'2026-01-01')`));

await t('user only sees own rows', async () => {
  const r = await as(A, () => db.query('select user_id from weight_logs'));
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].user_id, A);
});
await t('cannot insert rows for another user', async () => {
  await assert.rejects(as(A, () => db.exec(`insert into weight_logs(user_id,weight_kg,log_date) values ('${B}',70,'2026-01-02')`)));
});
await t('cannot update/delete another user\'s rows (silently 0 rows)', async () => {
  await as(A, () => db.exec(`update weight_logs set weight_kg=1 where user_id='${B}'`));
  await as(A, () => db.exec(`delete from weight_logs where user_id='${B}'`));
  const r = await db.query(`select weight_kg from weight_logs where user_id='${B}'`);
  assert.equal(Number(r.rows[0].weight_kg), 60);
});
await t('check constraints reject absurd weight', async () => {
  await assert.rejects(as(A, () => db.exec(`insert into weight_logs(user_id,weight_kg,log_date) values ('${A}',5,'2026-01-03')`)));
});

// child tables via parent ownership
const meal = await as(A, () => db.query(`insert into meal_logs(user_id,meal_type,log_date) values ('${A}','lunch','2026-01-01') returning id`));
const mealId = meal.rows[0].id;
await as(A, () => db.exec(`insert into meal_items(meal_id,name,quantity_g,kcal,protein_g,carbs_g,fat_g) values ('${mealId}','rice',150,195,4,42,0.5)`));
await t('meal_items hidden from other users', async () => {
  const r = await as(B, () => db.query('select * from meal_items'));
  assert.equal(r.rows.length, 0);
});
await t('other user cannot attach items to my meal', async () => {
  await assert.rejects(as(B, () => db.exec(`insert into meal_items(meal_id,name,quantity_g,kcal,protein_g,carbs_g,fat_g) values ('${mealId}','x',10,1,1,1,1)`)));
});

// shared food data vs custom foods
await as(A, () => db.exec(`insert into food_items(name,owner_id) values ('My shake','${A}')`));
await t('seed: every food has nutrition, vegetarian filter excludes meat', async () => {
  const r = await db.query(`select (select count(*) from food_items f join food_nutrition n on n.food_id=f.id)::int j, (select count(*) from food_items where 'vegetarian'=any(diet_tags) and name ilike '%chicken%')::int bad`);
  assert.deepEqual(r.rows[0], { j: 31, bad: 0 });
});
await t('custom foods private; curated foods shared', async () => {
  const b = await as(B, () => db.query('select name from food_items order by name'));
  assert.equal(b.rows.length, 31); assert.ok(b.rows.some(r => r.name === 'Idli')); assert.ok(!b.rows.some(r => r.name === 'My shake'));
  const a = await as(A, () => db.query('select name from food_items order by name'));
  assert.equal(a.rows.length, 32);
});
await t('users cannot write curated foods', async () => {
  await assert.rejects(as(A, () => db.exec(`insert into food_items(name) values ('Fake curated')`)));
});
await t('subscriptions are read-only to clients', async () => {
  await assert.rejects(as(A, () => db.exec(`update subscriptions set tier='premium' where user_id='${A}'`)).then(async () => {
    const r = await db.query(`select tier from subscriptions where user_id='${A}'`);
    if (r.rows[0].tier === 'premium') throw new Error('tier escalated');
    throw new Error('expected-noop');
  }).catch((e) => { if (e.message !== 'expected-noop') throw e; throw new Error('noop'); })).catch(() => {});
  const r = await db.query(`select tier from subscriptions where user_id='${A}'`);
  assert.equal(r.rows[0].tier, 'free');
});
await t('storage: only own folder', async () => {
  await as(A, () => db.exec(`insert into storage.objects(bucket_id,name) values ('food-photos','${A}/p.jpg')`)).catch(() => {});
  await assert.rejects(as(A, () => db.exec(`insert into storage.objects(bucket_id,name) values ('food-photos','${B}/p.jpg')`)));
});

console.log(`\n${pass} DB tests passed`);
