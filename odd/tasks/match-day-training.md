# El partido también entrena

The match row of the week stops being a day with no session. It offers the session the
rotation proposes, without moving the match, the layout or the four seeded days.

Specs are the contract; the Log is the record. Subagents read until `## Log`.

## Specs

- **S1.** The owner's own words: "Vale, con esto y con que el día de partido también pueda
  entrenar, creo que estaría bien si me aparece."
- **S2.** The match row in the week agenda offers to train, and starting it opens a session
  for the plan day the app proposes (S3, S4). The row keeps saying `Partido · Liga` /
  `Partido · Copa` and keeps its fixture, its date and its place in the week.
- **S3.** The proposal reuses the app's existing notion of "what comes next": the rotation's
  next plan day, the same one the app already uses for the training day. This feature adds no
  second rotation rule.
- **S4.** Within a week, the proposal is the first of the four days, in rotation order, that
  the week has no closed session for. When the week already has all four, the proposal falls
  back to the rotation's next day, so a fifth session is still possible.
- **S5.** Training on the match day moves nothing else: the match keeps its weekday, the
  layout is not rewritten (`WeekLayout` untouched), and the four days keep their weekdays.
  S11 and S12 of `odd/tasks/three-lift-plan.md` stand.
- **S6.** A match day with a session shows both: the fixture, and the fact that it was
  trained. Closing the session updates the row like any other trained day.
- **S7.** Nothing else changes on a week where the owner does not press it: an untrained match
  row keeps its words, its glyphs and its state (`Partido · Liga` / `Partido · Copa`, `Fijo`,
  the fixture sheet and the report) and gains only the action S2 requires. This spec is about
  the rest of the row, not about the action itself; an earlier wording of it said "no new
  button" and contradicted S2, which is the one that decides.
- **S8.** The documents that currently say the match day has no training are rewritten, not
  deleted: `odd/tasks/five-day-plan.md` S1 and `docs/product-requirements.md` FR-3.1.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1-S4 | worker | pending: pin the proposal rule and the startable match row |
| T2 | S2, S3, S5 | worker | pending: make the match row start a session |
| T3 | S4 | worker | pending: the week-aware proposal |
| T4 | S6, S7 | worker | pending: the row that says both things |
| T5 | S8 | inline | pending: the documents |

## Log

- **L1.** Owner, verbatim: "Vale, con esto y con que el día de partido también pueda entrenar,
  creo que estaría bien si me aparece. Por lo demás despliega esto".
- **L2.** Owner chose "El partido abre la sesión que toque" from three options (a picker of
  the four days; a fifth fixed training slot that would rewrite `WEEK_TEMPLATES`). S2-S4 are
  that option, including its stated behaviour: "Si el día propuesto ya se entrenó, propone el
  siguiente que falte".
- **L3.** This supersedes the "the match day has no session" half of `odd/tasks/five-day-plan.md`
  S1. What that spec settled — four days, three of strength, one of mobility, the match as a
  fifth row that is reported — is untouched.
- **L4.** The deploy of `b007f59` was requested in the same message and is running; this feature
  ships after it, as its own unit.
- **L5.** Deployed `b007f59` first, as asked: run 44287724562 succeeded and
  https://rupmctofu.github.io/rupfit/ answers 200.
- **L6.** Implemented in two delegated units. The pure rule (`weekProposalOf`) reuses
  `donePlanDayIdsOf`, `weekDatesOf` and `mondayInstantOf`, and falls back to `nextPlanDay`
  instead of copying the rotation. The UI unit adds `proposal` and `trained` to `AgendaDay`,
  makes `startRequestOf` answer `planDay ?? proposal`, and renders the match row's action as a
  quiet control (`TextButton`, play glyph, `Entrenar también`) so Inicio keeps exactly one
  filled action. A trained match row reads `Hecho` with its check, keeps `Partido · Liga`, its
  fixture and its report, and keeps `planDay: null`, `done: false`, `locked: true`,
  `lockReason: 'match'`.
- **L7.** Three tests that pinned the old truth were rewritten, not deleted: no way to start
  on the match day (twice), and the report row. The "one filled action" test passes untouched.
- **L8.** S7 contradicted S2 and the worker refused to guess; S7 is corrected above. The
  conflict was mine, not a product decision.
- **L9.** Known gap, not fixed: `stateWordOf`'s new branch also reaches the progress strip, so
  a trained match day reads `Jueves, hecho` there. It is the same fact stated twice; if the
  strip should say something else, that is its own unit (`src/features/home/today.ts`).
