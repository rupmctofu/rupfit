# La semana se calcula sola

The week stops remembering a placement. Its four days and the match come from the fixture's
template every time it is read, so no plan day can ever be left without a weekday.

Specs are the contract; the Log is the record. Subagents read until `## Log`.

## Specs

- **S1.** The owner's own words: "no entiendo porque hay una sección que se llama «dias que el
  partido dejó sin fecha», ya que los entrenos son de lunes a viernes, tengo 3 entrenos de
  fuerza, 1 de movilidad. Eso suman 4. Más el dia de partido… no entiendo porque hay copsas que
  se quedan fuera por culpa del partido". Asked how to settle it, he chose: "que se calcule
  sola".
- **S2.** The week is always derived from the fixture's template. A stored `WeekLayout` is never
  read, so a placement saved under a different fixture cannot displace a day.
- **S3.** No plan day can be left without a weekday. The four days always land Monday to Friday:
  league (match Thursday), cup (match Tuesday) and no fixture are the three templates, and all
  three fit four days beside the match.
- **S4.** What only existed to manage a stored placement disappears from the week: the drag and
  drop of days, the exchange of two days, and the "Días que el partido dejó sin fecha" section.
  They cannot be reached any more, so a control that does nothing must not be drawn.
- **S5.** No stored data is deleted. `WeekLayout` in the store, its synced table and
  `WeekRecord.swaps` stay where they are, unread. Removing them from the schema and from the
  cloud is a different unit with its own migration announcement, and it is not this one.
- **S6.** The three templates are unchanged, and so is which weekday the match takes in each.
- **S7.** A match day that was trained keeps saying both things (`odd/tasks/match-day-training.md`
  S6 stands): the fixture, and that it was trained.
- **S8.** The documents that describe a stored layout as a decision the app honours are
  rewritten: `docs/product-requirements.md` FR-3.1 and the `WeekLayout` paragraphs of
  `docs/data-model.md`.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S2, S3 | pending | the read path stops consulting the stored layout |
| T2 | S4 | pending | the week stops offering placement, and stops listing displaced days |
| T3 | S7 | pending | a trained match day still reads correctly |
| T4 | S5 | pending | nothing is deleted from the store or the schema |
| T5 | S8 | pending | the documents |

## Log

- **L1.** Owner asked why the section exists. Measured before answering: the three templates do
  fit four days plus the match Monday to Friday; `layoutOf` returns `input.weekLayout` whenever
  the store has one (`src/features/home/selectors.ts:305-311`), so the section is the symptom of
  a placement saved under another fixture, not of a shortage of weekdays.
- **L2.** Owner's decision, quoted verbatim in S1: "que se calcule sola", chosen over healing
  only the conflict and over leaving it as it is.
- **L3.** The consequence was stated before starting: with the week always derived, moving a day
  to another weekday stops having a meaning, so the drag affordance and the displaced-days
  section are removed rather than left as controls that do nothing.
