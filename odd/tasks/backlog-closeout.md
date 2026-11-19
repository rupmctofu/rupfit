# Los cuatro pendientes

The owner asked to resume every open item. They are four different jobs and they ship one at a
time, each with its own commit.

Specs are the contract; the Log is the record. Subagents read until `## Log`.

## Specs

- **S1.** The owner's own words: "yo los retomaria todos".
- **S2.** A regression test over the real store pins what the fake port cannot see: the
  prescription catch-up keeps every id, order and snapshot, deletes nothing, writes each day
  once, respects a pruned day, and records the one-field collision between a strength row an
  owner set to 1 RIR and the squat's own row.
- **S3.** A seeded day the owner deleted outright is not resurrected by the launch refresh.
  Today `missingSeedDays` re-adds any day the store lacks, which cannot tell a first-run store
  from an owner's deliberate deletion.
- **S4.** A tombstoned item does not enqueue a second delete op: deleting it once must leave one
  op, not two.
- **S5.** `WeekLayout` and `WeekRecord.swaps` leave the schema, the sync set and the codec, with
  the backup schema version raised and the removal announced to the owner as a Supabase step.
  No stored training data is touched: sessions, sets, plan days and the library are not in scope.
- **S6.** Nothing in S2-S5 changes what the app shows or what a session does, except that the
  legacy week-layout table stops being synchronised.

## Tasks

| ID | Spec | Risk | Commit |
| --- | --- | --- | --- |
| T1 | S2 | none | `6ada7ba`: the real-store regression test, seven cases |
| T2 | S3 | 1 | dropped — see L4: the state cannot be produced from the app |
| T3 | S4 | 1 | `96ed60b`: traced (L7) and the reachable half fixed |
| T4 | S5 | 1, 5 | `4a0c85c`: the retirement, verified at L8; the table dropped by the owner at L10 |

## Log

- **L1.** Owner, verbatim: "yo los retomaria todos", in reply to the four pending items listed at
  the end of the previous turn.
- **L2.** The four items were named then and are not re-derived here: the verifier's proposed
  regression test, `WeekLayout`/`swaps` removal, the resurrected seeded day, and the double
  delete op. The two `Promise.withResolvers` findings were a fifth, separately decided item.
- **L3.** `Risk: item 1` on T2-T4 because each either rewrites stored data or changes what a
  stored row means; T4 also carries item 5 because a synced table leaving the schema is a
  delivery step the owner has to perform in Supabase.
- **L4.** T2 is dropped, not done. `PlanRepositoryPort.remove` exists
  (`src/storage/port.ts:169`) but **no production code calls it**: the only caller in the tree
  is `tests/storage/repositories.test.ts:657`, and no screen deletes a day. So "a seeded day the
  owner deleted is resurrected" describes a state the app cannot reach; a tombstone for it would
  be machinery for an impossible case. If a delete-a-day affordance is ever built, `missingSeedDays`
  becomes a real defect the same day.
- **L5.** T3 is blocked, not fixed. I could not reproduce the double delete op in the time
  available: `applySyncRow` explicitly queues nothing when a row arrives from the remote
  (`src/storage/repositories/sync.ts:212-234`), and the only local deletion flow
  (`src/features/progress/deleteFlow.ts:88-96`) marks the row pending and then removes it, which
  is the documented invariant I-5 and not obviously a second op. Inventing a fix for a defect I
  cannot reproduce would be worse than leaving it open with the pointer.
- **L6.** T4 is blocked on capability, not on scope. Delegation is down in this session: the
  session's temp root was removed and every `subagent_run` fails with the same `ENOENT`
  (`mkdtemp`), so neither a worker nor an independent verifier can start. The week-layout
  retirement is `Risk: item 1` and `item 5` (stored rows and a synced table leaving the schema,
  plus a Supabase step only the owner can run), and unavailable proof blocks delivery. It waits
  for a session where the verifier can run.

- **L7.** T3 traced before touching anything (L5 said not to invent a fix). The literal claim
  is half true: a pulled tombstone that a later save prunes does enqueue a delete op, but two
  delete ops never coexist — the newer revision supersedes the older. Two coexisting ops need
  `plan.remove` twice, which no screen calls. Fixed the reachable half in `96ed60b`: a row
  that is already a tombstone is removed locally and queues nothing.
- **L8.** T4 verified independently on `4a0c85c`: seven of seven MET — nothing consults the
  layout, an owner's version 1 backup loads with every collection restored, training rows are
  untouched, a legacy week row reads as `{monday, match}`, the migration is idempotent, and the
  drawn week is byte-identical to before. Three advisories followed.
- **L9.** Advisories closed by the parent: A1, the import refusal said the app reads version 1
  while it reads 1 to 2 (`ed9a206`, the range now comes from the constants); the verifier's
  gap, the old-backup test asserted three collections and now compares the whole document; A2,
  two unrelated screenshots that had slipped into `4a0c85c` are out of the tree (they left in
  `96ed60b`, which swept the staged deletion — untidy, not harmful).
- **L10.** Deployed `ed9a206` and the site verified by content: `week_layout` no longer appears
  in the served bundle and the match-day action is still there. The owner ran
  `drop table if exists public.week_layout;` in the Supabase SQL editor and got
  "Success. No rows returned", so the table is gone and the retirement is complete on both
  sides.
