-- week_layout — the owner's fixed weekly assignment (odd/tasks/week-calendar.md T2, specs
-- S5 and S6): which of the plan days the owner puts on each weekday. It mirrors the
-- single-row `meta` record `weekLayout` (docs/data-model.md §3 `WeekLayout`, §5.1).
--
-- One row per owner, so the local key `weekLayout` is the row's `id` and a re-push of the
-- same assignment is an upsert of the same row. The owner prefix the client adds to every
-- remote id (`src/cloud/remote.ts`) is what keeps two accounts from colliding on it.
--
-- `slots` is one JSON text column, not a column per weekday: the record stores the seven
-- slots whole and nothing queries a single weekday (data-model §5.2). The client writes
-- it with `JSON.stringify` — `ENCODE['week_layout.slots']` in src/cloud/remote.ts — and
-- reads it back with `JSON.parse`, which is why the column is `text` and the server
-- treats it as an opaque document instead of a shape it has to know.

create table public.week_layout (
  id text primary key,

  slots text not null default '[]',

  -- Sync columns (docs/cloud-sync.md §2).
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  -- Target of the composite foreign key a future child row would use, so a child cannot
  -- be attached to another owner's layout even if its id is guessed.
  constraint week_layout_user_id_key unique (user_id, id)
);

comment on table public.week_layout is
  'Mirror of IndexedDB meta.weekLayout: the owner''s fixed weekly assignment, seven slots.';

comment on column public.week_layout.slots is
  'The seven WeekLayoutSlot values as one JSON array, Monday first, as the client encodes them.';

create index week_layout_user_updated_idx on public.week_layout (user_id, updated_at);

create trigger week_layout_set_updated_at
  before insert or update on public.week_layout
  for each row execute function public.set_updated_at();

alter table public.week_layout enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.week_layout to authenticated;
revoke all on public.week_layout from anon;

create policy "week_layout select own" on public.week_layout
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "week_layout insert own" on public.week_layout
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "week_layout update own" on public.week_layout
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "week_layout delete own" on public.week_layout
  for delete to authenticated
  using ((select auth.uid()) = user_id);
