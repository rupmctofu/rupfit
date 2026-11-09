-- activities — cardio / other activity rows, mirror of IndexedDB `activities`
-- (docs/data-model.md §3 `ActivityRecord`, §5.2 `ActivityRow`).
--
-- `date` is a record field name; mirrored as `occurred_at` (epoch milliseconds).
-- I-11: re-importing the same bridge sample must not duplicate a row. The local store
-- gets that from a unique index that simply skips rows with no `externalSampleId`; here
-- it is the same idea as a partial unique index scoped to the owner.

create table public.activities (
  id text primary key,

  occurred_at bigint not null,
  kind text not null default 'other'
    check (kind in ('strength', 'cardio', 'other')),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  active_energy_kcal numeric(7, 2) check (active_energy_kcal >= 0),
  provenance text not null default 'manual'
    check (provenance in ('imported', 'manual', 'estimated')),
  external_sample_id text,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz
);

comment on table public.activities is
  'Mirror of IndexedDB activities. occurred_at mirrors the record field `date`.';

create index activities_user_updated_idx on public.activities (user_id, updated_at);
create index activities_user_occurred_idx on public.activities (user_id, occurred_at);
create unique index activities_user_external_sample_idx
  on public.activities (user_id, external_sample_id)
  where external_sample_id is not null;

create trigger activities_set_updated_at
  before insert or update on public.activities
  for each row execute function public.set_updated_at();

alter table public.activities enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.activities to authenticated;
revoke all on public.activities from anon;

create policy "activities select own" on public.activities
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "activities insert own" on public.activities
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "activities update own" on public.activities
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "activities delete own" on public.activities
  for delete to authenticated
  using ((select auth.uid()) = user_id);
