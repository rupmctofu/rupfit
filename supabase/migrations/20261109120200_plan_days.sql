-- plan_days — weekday template days, mirror of IndexedDB `planDays`
-- (docs/data-model.md §5.2 `PlanDayRow`).
--
-- `order` is a reserved word in PostgreSQL, so the mirrored column is `day_order`.

create table public.plan_days (
  id text primary key,

  name text not null,
  day_order smallint not null default 0,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  -- Target of the composite foreign key child rows use, so a child cannot be attached
  -- to another user's parent even if their id is guessed.
  constraint plan_days_user_id_key unique (user_id, id)
);

comment on table public.plan_days is
  'Mirror of IndexedDB planDays. day_order mirrors the record field `order`.';

create index plan_days_user_updated_idx on public.plan_days (user_id, updated_at);
create index plan_days_user_order_idx on public.plan_days (user_id, day_order);

create trigger plan_days_set_updated_at
  before insert or update on public.plan_days
  for each row execute function public.set_updated_at();

alter table public.plan_days enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.plan_days to authenticated;
revoke all on public.plan_days from anon;

create policy "plan_days select own" on public.plan_days
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "plan_days insert own" on public.plan_days
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "plan_days update own" on public.plan_days
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "plan_days delete own" on public.plan_days
  for delete to authenticated
  using ((select auth.uid()) = user_id);
