-- body_measurements — body weight and measurements, mirror of IndexedDB
-- `bodyMeasurements` (docs/data-model.md §3 `BodyMeasurement`, §5.2 `BodyMeasurementRow`).
--
-- `date` is a record field name; mirrored as `measured_at` (epoch milliseconds).
-- I-10: at least one measure is non-null, enforced here as well as on the client.

create table public.body_measurements (
  id text primary key,

  measured_at bigint not null,
  weight_kg numeric(7, 3) check (weight_kg > 0),
  waist_cm numeric(6, 2) check (waist_cm > 0),
  chest_cm numeric(6, 2) check (chest_cm > 0),
  arm_cm numeric(6, 2) check (arm_cm > 0),
  thigh_cm numeric(6, 2) check (thigh_cm > 0),
  hip_cm numeric(6, 2) check (hip_cm > 0),
  body_fat_percent numeric(5, 2)
    check (body_fat_percent > 0 and body_fat_percent <= 100),
  provenance text not null default 'manual'
    check (provenance in ('imported', 'manual', 'estimated')),

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  constraint body_measurements_at_least_one_measure check (
    num_nonnulls(
      weight_kg, waist_cm, chest_cm, arm_cm, thigh_cm, hip_cm, body_fat_percent
    ) > 0
  )
);

comment on table public.body_measurements is
  'Mirror of IndexedDB bodyMeasurements. measured_at mirrors the record field `date`.';

create index body_measurements_user_updated_idx
  on public.body_measurements (user_id, updated_at);
create index body_measurements_user_measured_idx
  on public.body_measurements (user_id, measured_at);

create trigger body_measurements_set_updated_at
  before insert or update on public.body_measurements
  for each row execute function public.set_updated_at();

alter table public.body_measurements enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.body_measurements to authenticated;
revoke all on public.body_measurements from anon;

create policy "body_measurements select own" on public.body_measurements
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "body_measurements insert own" on public.body_measurements
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "body_measurements update own" on public.body_measurements
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "body_measurements delete own" on public.body_measurements
  for delete to authenticated
  using ((select auth.uid()) = user_id);
