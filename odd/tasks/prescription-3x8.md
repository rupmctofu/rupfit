# Tres series de ocho, a fallo

The block table stops walking: every strength day prescribes three sets of eight repetitions
at RIR 0, in every block, and only the squat keeps the one rep in reserve the owner asked for.

Specs are the contract; the Log is the record. Subagents read until `## Log`.

## Specs

- **S1.** The owner's own words, in two messages: "pero te sije 3 series de 8 reps en cada serie
  con rir0", then "perdon, todo rir1". The second one is the decision; the first one was a slip
  he corrected before any code changed.
- **S2.** Three sets, in every block. The ladder that raised the strength, hypertrophy and
  accessory columns to four sets in blocks 3 and 4 is gone.
- **S3.** Eight repetitions, fixed: the prescription is `8–8`, not the `8–10` range it was.
- **S4.** RIR 1 on every set of the strength, hypertrophy and accessory columns.
- **S5.** The squat stops being a special case. It kept its own 1 RIR override because the
  column said 0; with the column at 1 the override would be a line that says nothing, so it is
  removed and the seed row reads the column like every other exercise.
- **S6.** The `preventive` column is untouched: two sets, far from failure, because Nordic curl
  and Copenhagen plank are the pair that punishes an eager start, and nothing the owner said
  was about them.
- **S7.** The `conditioning` column is untouched: prescribed by time, one repetition, RIR 4–5.
- **S8.** Recorded consequence, not a defect: with S2-S4 the strength, hypertrophy and accessory
  columns carry identical numbers. The role still travels on the prescription and still decides
  the rest interval and the engine's increment rule; what three columns can no longer do is
  prescribe different volume.
- **S9.** The progression documents that describe the table (`docs/progression-engine.md`,
  `docs/training-science.md` §6) are rewritten where they state the ladder or the range.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1-S4 | worker | pending: the block table |
| T2 | S5-S7 | worker | pending: the columns that must not move |
| T3 | S8 | worker | pending: the test that counted four distinct profiles |
| T4 | S9 | inline | pending: the documents |

## Log

- **L1.** Owner, verbatim: "pero te sije 3 series de 8 reps en cada serie con rir0".
- **L2.** Measured before changing anything: the app already prescribed RIR 0 for strength,
  hypertrophy and accessory, but as an `8–10` range, with a ladder to four sets in blocks 3 and
  4, and with the squat at RIR 1 (`src/core/engine/readaptation.ts:73-99`). So the deviation was
  S2 and S3, not the RIR.
- **L3.** Asked and answered in one round: "3 series siempre" (not "mantener la subida a 4") and
  "Sentadilla se queda en RIR 1". Both are decisions, and S2 and S5 are them.
- **L5.** Owner corrected the target before any code changed: "perdon, todo rir1". So S4 is 1,
  not 0, and the squat's exception disappears instead of being preserved (S5). No commit ever
  carried the RIR 0 version.
- **L4.** This supersedes `odd/tasks/five-day-plan.md` S6/S7 in the two numbers it fixes: they
  said 8–10 and left the set count to the ladder. Their intent — every set of the strength days
  at failure, isolation included — is preserved.
- **L6.** The prescription is stored per item, not read from the block table when a screen
  draws it: `PlanItem.prescription` is written once at seed time (`src/core/seed/plan.ts`) and
  the session and the routine cards read it back. T1-T3 therefore change the numbers a *new*
  store gets and leave a device seeded by the previous release showing `3 × 8–10` at RIR 0 on
  its strength, hypertrophy and accessory slots forever — the squat included, at its own
  RIR 1. This unit is that catch-up, and it had to be its own: the launch refresh already
  knows how to recognise a day it wrote, not a row. It records the previous release's four
  prescriptions as data (`REPLACED_SEED_PRESCRIPTIONS`, verified against
  `git show HEAD:src/core/engine/readaptation.ts` and `HEAD:src/core/seed/plan.ts`), rewrites
  a row only when it carries one of them in every field, and leaves the owner's own
  prescriptions, custom rows and the `preventive` and `conditioning` rows exactly as they
  are. Verified with `npx vitest run` and both typecheck projects. Commit: pending (the
  parent owns it).
