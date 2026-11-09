-- plan_items — ordered items of a plan day, mirror of IndexedDB `planItems`
-- (docs/data-model.md §5.2 `PlanItemRow`).
--
-- Child of plan_days. `prescription` is stored whole as jsonb: data-model §5.2 says it
-- "is read and written with its parent, never queried by field", so mirroring it as a
-- document keeps the copy lossless instead of inventing column names.

create table public.plan_items (
  id text primary key,
  plan_day_id text not null,

  item_order smallint not null default 0,
  exercise_id text,
  exercise_name_snapshot text not null,
  prescription jsonb not null,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  -- Ownership-scoped parent link: the FK matches on user_id as well as id, so a child
  -- row can never be attached to another user's plan day.
  constraint plan_items_plan_day_fkey
    foreign key (user_id, plan_day_id)
    references public.plan_days (user_id, id)
    on delete cascade
);

comment on table public.plan_items is
  'Mirror of IndexedDB planItems. item_order mirrors the record field `order`.';

create index plan_items_user_updated_idx on public.plan_items (user_id, updated_at);
create index plan_items_user_day_order_idx
  on public.plan_items (user_id, plan_day_id, item_order);

create trigger plan_items_set_updated_at
  before insert or update on public.plan_items
  for each row execute function public.set_updated_at();

alter table public.plan_items enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.plan_items to authenticated;
revoke all on public.plan_items from anon;

create policy "plan_items select own" on public.plan_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "plan_items insert own" on public.plan_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "plan_items update own" on public.plan_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "plan_items delete own" on public.plan_items
  for delete to authenticated
  using ((select auth.uid()) = user_id);
