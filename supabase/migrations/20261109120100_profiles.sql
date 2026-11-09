-- profiles — one row per user profile, mirroring the `profile` record of IndexedDB
-- `meta` (docs/data-model.md §3 `UserProfile`, §5.2 `MetaRow`).
--
-- The local id is kept as the primary key so a push is an upsert of the same row.

create table public.profiles (
  id text primary key,

  display_name text,
  mass_unit text not null default 'kilograms'
    check (mass_unit in ('kilograms', 'pounds')),
  weight_goal text
    check (weight_goal in ('maintain', 'lose', 'gain')),
  weekly_training_days smallint not null default 0
    check (weekly_training_days between 0 and 7),
  available_equipment text[] not null default '{}'
    check (available_equipment <@ array[
      'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band'
    ]::text[]),
  auto_start_rest_timer boolean not null default true,

  -- Sync columns (docs/cloud-sync.md § "Sync columns on every table").
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz
);

comment on table public.profiles is
  'Mirror of the IndexedDB single-row profile record. Keyed by the app id, owned by user_id.';

create index profiles_user_updated_idx on public.profiles (user_id, updated_at);

create trigger profiles_set_updated_at
  before insert or update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.profiles to authenticated;
revoke all on public.profiles from anon;

create policy "profiles select own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles insert own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "profiles delete own" on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id);
