# Un día entre los tres pesados

The three strength days stop sitting on consecutive weekdays. Squat, bench press and deadlift
always fall on Monday, Wednesday and Friday, and the mobility day and the match move around
them.

Specs are the contract; the Log is the record. Subagents read until `## Log`.

## Specs

- **S1.** The owner's own words: "no quiero 2 entrenos fuertes seguidos. Sentadilla, press
  banca, y peso muerto tienen que tener 1 dia de separacion".
- **S2.** In every kind of week the three strength days are Monday, Wednesday and Friday. No
  two of them sit on consecutive weekdays.
- **S3.** What that costs, accepted by the owner with the cost in front of him: in a cup week
  the squat lands on Wednesday, the day after the Tuesday match; in a league week the deadlift
  stays on Friday, the day after the Thursday match. Five weekdays with a match inside them and
  two gaps between three lifts leave no other arrangement.
- **S4.** The mobility and core day takes the weekday the three lifts leave free: Tuesday in a
  league week, Thursday in a cup week, and Tuesday in a week without a fixture, where Thursday
  is rest.
- **S5.** The day before the match is never a leg day: in a league week it is the press, in a
  cup week it is the press as well. The match day itself keeps everything
  `odd/tasks/match-day-training.md` gave it.
- **S6.** The day-after-the-match guard that refuses a swap keeps refusing to *introduce* the
  legs there, and stops refusing exchanges that leave the accepted layout untouched. Without
  that, a cup week could exchange nothing but the legs.
- **S7.** The documents that print the weekday table print this one.

## Tasks

| ID | Spec | Risk | Commit |
| --- | --- | --- | --- |
| T1 | S2, S4 | none | `c6ac505`: the three templates |
| T2 | S6 | none | `c6ac505`: the swap guard compares against the template |
| T3 | S2-S4 | none | `c6ac505`: every test that pinned the old weekdays |
| T4 | S7 | none | `c6ac505`: FR-3.1 |

## Log

- **L1.** Owner, verbatim: "no quiero 2 entrenos fuertes seguidos. Sentadilla, press banca, y
  peso muerto tienen que tener 1 dia de separacion".
- **L2.** Measured before answering: the league week had the squat on Monday and the press on
  Tuesday, and the cup week had press, squat and deadlift on Wednesday, Thursday and Friday —
  one adjacent pair in the league and two in the cup.
- **L3.** Asked what to do about the Friday deadlift of a league week, the owner chose "Acepto
  el peso muerto el día después del partido". That is S3, and the cup's Wednesday squat follows
  from the same arithmetic; it was stated before implementing it.
- **L4.** `applySwaps` already refused an exchange that leaves the legs the day after the match,
  comparing against the template. `targetsOf` refused the *result* unconditionally, so with the
  cup template now holding the squat on Wednesday it offered only the squat itself. Fixed to
  compare against the template too (S6), which is what the guard always meant.
- **L5.** Test churn: 49 assertions in five files pinned the old weekdays, plus the table pin in
  `tests/week-plan.test.ts`. Each rewritten assertion states a rule, and the two files whose
  whole fixture assumed "today is Wednesday" moved their Monday-of-the-week fixture to Tuesday
  instead of renaming the day under test.
- **L6.** Suite after the change: 1249 tests in 80 files, typecheck and build clean.
