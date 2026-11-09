# Rupfit — Cloud Sync Schema

Status: designed, not yet executed. The SQL under `supabase/migrations/` has never
been run against a database: no Supabase project exists for this repository and no
credentials exist in it either. Everything below describes what the migrations say,
not what has been observed on a live server.

The local store stays the source of truth (`odd/tasks/cloud-sync.md` S1). The remote
schema is a **mirror** of what IndexedDB already holds (`docs/data-model.md` §3, §5):
same entities, same ids, same parent/child relationships, plus the columns a
synchronisation needs. It is not a second design.

---

## 1. Tables

Ten tables, one per stored entity. Every id is the app's own
`crypto.randomUUID()` string kept as `text`, so a row pushed from a device lands on
the same primary key it has locally and a second push of anything is a no-op.

| Table | Mirrors (IndexedDB) | Key columns |
| --- | --- | --- |
| `profiles` | `meta` → `profile` | `id`, `display_name`, `mass_unit`, `weight_goal`, `weekly_training_days`, `available_equipment`, `auto_start_rest_timer` |
| `plan_days` | `planDays` | `id`, `name`, `day_order` |
| `plan_items` | `planItems` | `id`, `plan_day_id` → `plan_days`, `item_order`, `exercise_id`, `exercise_name_snapshot`, `prescription` (jsonb) |
| `phase_state` | `meta` → `phaseState` | `id`, `block`, `passed_blocks`, `role`, `scheduled_sessions_per_week` |
| `exercises` | `exercises` | `id`, `name`, `primary_muscle`, `pattern`, `equipment`, `load_increment_kg`, `is_custom`, `is_archived`, `secondary_muscles`, `description`, `variant_of`, `alternatives` |
| `sessions` | `sessions` | `id`, `plan_day_id`, `day_name_snapshot`, `scheduled_date`, `started_at`, `ended_at`, `phase` (jsonb), `status`, `deletion_pending` |
| `session_exercises` | `exerciseSessions` | `id`, `session_id` → `sessions`, `session_date`, `session_order`, `exercise_id`, `exercise_name_snapshot`, `prescription`, `recommendation`, `decision` (jsonb), `recommended_weight_kg`, `used_weight_kg`, `load_delta_kg`, `status`, `completed_at` |
| `sets` | `sets` | `id`, `exercise_session_id` → `session_exercises`, `session_id`, `set_index`, `weight_kg`, `target_reps`, `actual_reps`, `effort`, `discomfort`, `confirmed_at` |
| `body_measurements` | `bodyMeasurements` | `id`, `measured_at`, `weight_kg`, `waist_cm`, `chest_cm`, `arm_cm`, `thigh_cm`, `hip_cm`, `body_fat_percent`, `provenance` |
| `activities` | `activities` | `id`, `occurred_at`, `kind`, `duration_seconds`, `active_energy_kcal`, `provenance`, `external_sample_id` |

Plus the sync columns on every row: `user_id`, `created_at`, `updated_at`, `rev`,
`deleted_at` (§2).

### Name and type mapping

Three record field names collide with SQL keywords or types, so they are renamed and
nothing else is:

| Local record | Column | Why |
| --- | --- | --- |
| `order` (plan day, plan item, exercise session) | `day_order`, `item_order`, `session_order` | `order` is reserved |
| `index` (set) | `set_index` | `index` is reserved |
| `date` (measurement, activity) | `measured_at`, `occurred_at` | reads as an instant, not a calendar day |

Types follow the same rule as `docs/data-model.md` §2:

- **`EpochMs` → `bigint`**, never `timestamptz`. A stored instant is milliseconds and
  must round-trip exactly; converting to a timestamp only adds a time-zone step that
  can shift it. `created_at` / `updated_at` *are* `timestamptz`, because they are
  server bookkeeping, not domain evidence.
- **`number` → `numeric(7,3)` for kilograms, `numeric(6,2)` for centimetres.** Loads
  like 2.5 and 1.25 exist; `float` would make equality checks unreliable.
- **Composite values the app stores whole → `jsonb`.** `prescription`,
  `recommendation`, `decision` and `phase` are never queried by field (§5.2 says so
  explicitly for the prescription), so mirroring them as documents keeps them lossless
  instead of inventing a column per member. `available_equipment`, `secondary_muscles`
  and `alternatives` are flat closed sets, so they are `text[]` and can be queried.
- **Closed value sets are `text` + `check`**, not PostgreSQL enums: adding a muscle
  group must not need an enum migration that rewrites a table.

### Relationships

`plan_items.plan_day_id`, `session_exercises.session_id` and
`sets.exercise_session_id` are foreign keys with `on delete cascade`: a child cannot
outlive its parent, and a purge cannot leave orphans.

Those three keys are **ownership-scoped**: the parent tables carry
`unique (user_id, id)` and the child references `(user_id, parent_id)`, so a child row
cannot be attached to another account's parent even if its id were guessed. A plain
`references parent (id)` would let a client link its own row into someone else's
tree; RLS would hide the child but the reference would still exist.

`sessions.plan_day_id` is **not** a foreign key. A session is history and must survive
the deletion of the template day it came from — the same reason the day name is
snapshotted into the row (`docs/data-model.md` I-4).

Because the mirror is pushed in dependency order (plan day → item, session → exercise
session → set), the migrations' `default auth.uid()` and the foreign keys are
satisfiable by a single ordered push. Out-of-order application would be a client bug,
not a schema one.

---

## 2. Sync columns

Every table carries the same five columns:

| Column | Type | Default | Purpose |
| --- | --- | --- | --- |
| `user_id` | `uuid not null` | `auth.uid()` | owner, set by the server from the JWT |
| `created_at` | `timestamptz not null` | `now()` | server-side insert instant |
| `updated_at` | `timestamptz not null` | `now()` | server-side write instant, stamped by trigger |
| `rev` | `integer not null` | `1` | the client's conflict counter, `rev >= 1` |
| `deleted_at` | `timestamptz` | `null` | soft delete; `null` = live row |

`updated_at` is written by `public.set_updated_at()` (`BEFORE INSERT OR UPDATE`) from
the **server** clock, never from the client. Pull asks "rows changed since my last
successful pull", so that ordering has to come from one clock; a device with a skewed
clock cannot reorder the stream. `rev` is the opposite: the client owns it, because
only the client knows how many times it edited the row while offline.

Soft delete means a deletion **is** an update: set `deleted_at`, raise `rev`. Nothing
is removed by the sync path, which is why a device that was offline for a week still
learns that a session was deleted (§ "no automatic overwrite", spec S4).

### Idempotency

The rule is one sentence: **a push is an upsert on the app id, so applying the same
row and the same `rev` twice leaves one row.**

- `primary key (id)` on every table. The id is generated on the device by
  `crypto.randomUUID()`, not by the database, so a retried push targets the same row
  it targeted the first time. There is no `serial`, no `gen_random_uuid()` in the
  write path, and therefore no way for a retry to create a second row.
- `user_id` defaults to `auth.uid()` and is checked by the insert policy, so a row
  cannot be claimed for another account by sending a different `user_id`.
- `activities` additionally has a **partial unique index** on
  `(user_id, external_sample_id) where external_sample_id is not null`. Re-importing
  the same Health-export sample cannot duplicate a row, and manual rows (which have no
  sample id) do not collide with each other. This mirrors the local
  `by_externalSampleId` index and the invariant behind it (`docs/data-model.md` I-11).
- Every table has `(user_id, updated_at)` so a pull is an index scan bounded by the
  owner and ordered by the change clock; relational tables add the ordering index the
  app actually queries (`(user_id, plan_day_id, item_order)`,
  `(user_id, session_id, session_order)`, `(user_id, exercise_id, session_date)`,
  `(user_id, exercise_session_id, set_index)`).

Losing an upsert race is harmless for the same reason: two pushes of the same key
converge on one row, and `rev` is available to the sync service (T4) to decide which
values survive instead of letting the last writer silently win.

---

## 3. Row Level Security

RLS is **enabled on all ten tables** and there is no table left without it. Each table
has exactly four policies — `select`, `insert`, `update`, `delete` — scoped to the
`authenticated` role and to one predicate:

```
(select auth.uid()) = user_id
```

- `select` and `delete` use it as `USING`; `insert` as `WITH CHECK`; `update` as both,
  so a row cannot be moved to another owner by an update.
- The `auth.uid()` call is wrapped in a subselect, which is what makes PostgreSQL
  evaluate it once per statement instead of once per row.
- No policy grants a user access to another user's rows, and there is no `anon`
  policy: unauthenticated requests see nothing.
- No policy, grant or function in `supabase/` references `service_role`, and the
  service-role key is a server secret that must never reach a frontend bundle. Nothing
  in this plan needs it, so nothing requests it.

Each table also gets explicit grants: `select, insert, update, delete` to
`authenticated`, and `revoke all` from `anon`. Supabase's default privileges usually
provide the first and not the second; stating both means the schema does not depend on
project defaults. RLS is what bounds the rows — a grant alone returns nothing to a
user who owns no row.

`default auth.uid()` is a convenience, not the guarantee: the insert policy is the
guarantee, because a client that sends a foreign `user_id` is rejected rather than
trusted. The ownership-scoped foreign keys above close the same hole for references.

The one non-table object is `public.set_updated_at()`. It is a plain trigger function
declared `security invoker` with an empty `search_path`: it only assigns
`new.updated_at` and calls `pg_catalog.now()`, so it needs no elevated rights.
`security definer` is not used anywhere in this schema.

---

## 4. Migration files

One concern per file, in this order:

| File | Concern |
| --- | --- |
| `20261109120000_set_updated_at_function.sql` | the shared `updated_at` trigger function |
| `20261109120100_profiles.sql` | `profiles`: table, index, trigger, RLS |
| `20261109120200_plan_days.sql` | `plan_days` |
| `20261109120300_plan_items.sql` | `plan_items` + FK to `plan_days` |
| `20261109120400_phase_state.sql` | `phase_state` |
| `20261109120500_exercises.sql` | `exercises` |
| `20261109120600_sessions.sql` | `sessions` |
| `20261109120700_session_exercises.sql` | `session_exercises` + FK to `sessions` |
| `20261109120800_sets.sql` | `sets` + FK to `session_exercises` |
| `20261109120900_body_measurements.sql` | `body_measurements` |
| `20261109121000_activities.sql` | `activities` + unique dedupe index |

Each table file is self-contained on purpose: a reviewer reading
`20261109120800_sets.sql` sees the columns, the indexes, the trigger and the four
policies of that table in one screen, instead of chasing a second file.

`supabase/types.ts` is a hand-written `Database` type mirroring these tables. A
generated file (`npx supabase gen types typescript`) needs a live project; when one
exists, replace it and diff — no other file should need to change.

---

## 5. Manual steps for the owner

Nothing here can be done by the repository. In order:

1. **Create the project.** Sign in at `https://supabase.com`, create a project, choose
   the region closest to where the app is used, and keep the generated database
   password in a password manager. It is not needed by the app and must not be added to
   this repository.
2. **Run the migrations.** Either connect the Supabase CLI
   (`npx supabase link --project-ref <ref>`, then `npx supabase db push`) or paste each
   file from `supabase/migrations/` into the SQL editor **in filename order**. The order
   matters: the trigger function comes first, parents before children.
3. **Verify RLS is on.** In the SQL editor:
   `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';`
   Every mirrored table must show `true`. Then, with a real signed-in session, confirm
   that selecting from each table returns only that user's rows.
4. **Configure authentication.** Email/password only (spec S2): no Google, no Apple.
   Set the Site URL to the deployed origin and add it to the redirect allow-list so
   password recovery returns to the app. Leave "Confirm email" as decided for the
   product; the client must handle both on and off.
5. **Put the two public values in the build environment.** Only two are needed by a
   frontend: the project URL and the **anon** (publishable) key.
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, in `.env.local` for development
   and in the host's environment settings for deployment. RLS is what protects the
   data; the anon key is public by design.
   **The `service_role` key is never placed in a frontend environment variable, a
   bundle, or this repository.** Nothing in the plan needs it.
6. **Never commit a key.** `.gitignore` already ignores `.env` and `.env.*`, which is
   also why no `.env.example` is committed here: the pattern would exclude it. If the
   owner wants a committed example, the repository needs a `!.env.example` negation
   first — a `.gitignore` change outside this task's scope.

Current state: **no credentials exist in this repository.** No URL, no key, no
password, no project reference — the values above are placeholders to be filled in by
the owner in an ignored file.

---

## 6. What a live project still has to prove

The SQL is unexecuted. Running it is step 2 above; after that, these are the checks
that cannot be made from here:

- the migrations apply cleanly, in order, in the hosted PostgreSQL version;
- `auth.uid()` is available and the policies behave under a real JWT — including the
  negative case, a second user getting zero rows;
- the `updated_at` trigger fires on upsert (`on conflict do update`) as well as on
  insert;
- an upsert repeated with the same `rev` leaves a single row, and the
  `activities` partial unique index rejects a duplicate sample id;
- the ownership-scoped foreign keys accept the dependency-ordered push and reject both
  an orphan child and a child pointed at another account's parent.
