-- sets — one row per confirmed set, mirror of IndexedDB `sets`
-- (docs/data-model.md §3 `SetRecord`, §5.2 `SetRecordRow`).
--
-- Child of session_exercises. `index` is a reserved word, so the mirrored column is
-- `set_index`; it stays 1-based and matches the card label "SERIE n".
-- `effort` and `discomfort` are nullable because null means unanswered (I-7): a set
-- with no answer must round-trip as null, never as a default.

create table public.sets (
  id text primary key,
  exercise_session_id text not null,

  -- Denormalised for session-level reads, as in the local record.
  session_id text not null,
  set_index smallint not null check (set_index >= 1),
  weight_kg numeric(7, 3) not null,
  target_reps smallint not null check (target_reps >= 0),
  actual_reps smallint not null check (actual_reps >= 0),
  effort smallint check (effort between 0 and 3),
  discomfort smallint check (discomfort between 0 and 2),
  confirmed_at bigint not null,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  constraint sets_exercise_session_fkey
    foreign key (user_id, exercise_session_id)
    references public.session_exercises (user_id, id)
    on delete cascade
);

comment on table public.sets is
  'Mirror of IndexedDB sets. weight_kg is always kilograms; confirmed_at is epoch milliseconds.';

create index sets_user_updated_idx on public.sets (user_id, updated_at);
create index sets_user_exercise_session_index_idx
  on public.sets (user_id, exercise_session_id, set_index);

create trigger sets_set_updated_at
  before insert or update on public.sets
  for each row execute function public.set_updated_at();

alter table public.sets enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.sets to authenticated;
revoke all on public.sets from anon;

create policy "sets select own" on public.sets
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "sets insert own" on public.sets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "sets update own" on public.sets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "sets delete own" on public.sets
  for delete to authenticated
  using ((select auth.uid()) = user_id);
