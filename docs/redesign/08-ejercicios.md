# T8 — Ejercicios (`features/train/`)

The tab at `#/entrenar`, composed for the dark premium direction
(`odd/tasks/dark-premium-redesign.md` T8, S1–S8). Presentation only: no state, hook,
handler, selector, data shape, progression rule, persistence, sync or route was touched.
The diff of `src/features/train/` is one screen's markup and one stylesheet.

## The composition, in reading order

| # | Block | Where it lives |
|---|---|---|
| 1 | Header: `Ejercicios` at the top of the type scale, then the week | `TrainScreen.tsx` → `header.train__head` |
| 2 | The empty state of a store with no routine, said once | `TrainScreen.tsx` → `EmptyState` |
| 3 | **Hoy** — the real session of the day, the protagonist card, its one action inside it | `TrainScreen.tsx` → `.train-today` |
| 4 | The reason a start did nothing, only while the sheet is closed | `TrainScreen.tsx` → `ErrorBanner` / `Banner` |
| 5 | **Tu rutina** — one card per routine day, the whole card the target | `TrainScreen.tsx` → `ul.train-days` |
| 6 | `Ver y editar la rutina` — the quiet way into the sheet | `TrainScreen.tsx` → `TextButton` |
| 7 | The rest day as one sentence under the routine, never a card | `TrainScreen.tsx` → `.train__no-session` |
| 8 | Readaptación: the block, its week chip and the one-line note | `TrainScreen.tsx` → `Card.train-phase` |
| 9 | The routine sheet: the stored day, the editor, the library | `RoutineEditor.tsx` (unchanged markup) |

Nothing moved across those blocks except the primary action, which now sits inside the
card it starts — the same `onStartDay(todayDay.planDayId)` the button already called. The
notices stay under the card, where the failure that produced them is read next to the
thing that failed.

## What each card is made of

- **Today's card** (`Card` default + `.train-today`): `--color-surface-raised`, the 16 px
  inset, the day's name at `--text-title-lg` (`ds-card-title--large`), the exercise count
  as `ds-meta`, then `PrimaryAction` (`Abrir la sesión de hoy`) or, on a closed day,
  `Ver el resumen` as a text button. The readiness switch is unchanged: the count is hidden
  once the day is `hecha`, and a session whose plan day has left the template keeps its
  title and offers nothing.
- **A routine day** (`Card padding="none"` + a full-bleed `button.train-day`): a 34 px
  badge on the raised ground, the day at `--text-card-title` (20 px), its subtitle as
  `ds-meta`, the state as a `Chip`, and the chevron that promises the sheet it opens. The
  card carries the 48 px floor and the 12/16 px inset, so the whole surface is the target
  and the words inside it are not the only place a thumb can land (S8).
- **The state word** is the only thing that changed carrier: `hoy` and `hecha` used to be
  a right-aligned word from `DataRow`'s status column, and they are the system's chips now
  (`accent` / `success`). `statusOf` still decides all three words, and `pendiente` is
  still not printed: it is the ordinary state of a fresh week and three identical words
  cost the titles their line.

## Where each figure comes from (S6 — nothing invented)

| On screen | Source at render time |
|---|---|
| `Semana del 16 de noviembre` | `formatWeekOf(now)` → `view.weekLabel`, unchanged |
| `Torso A` (the card) | `todaySession.title`, the stored session's `dayNameSnapshot` |
| `6 ejercicios` | `formatExerciseCount(todayDay.items.length)`, the template day's items |
| `Pierna`, `Torso B` | `formatDayName(day.name)` → `view.days[i].title`, unchanged |
| `Lunes · 12.660 kg · 52 min` | `subtitleOf`: the weekday of the session, `dayFocus`, `sessionVolumeKg` and `sessionDurationMs` — the same line the list already printed |
| `hecha` / `hoy` | `statusOf` → `day.status.word` / `.tone` |
| `semana 2 de 4` | `phaseState.block` over `READAPTATION_BLOCKS`, unchanged |
| the library rows | `source.library`, read once for the sheet (see below) |

No percentage, no delta, no goal and no new count appears. The redesign changed the type,
the ground and the shape of what these figures sit in; not one of them is computed here.

## The accent budget

`tests/accent-budget.test.ts` is unchanged and green, and `train.css` passes it by
**spending nothing**: the file never spells `--color-accent`, `-text` or `-muted`. The one
filled control is `PrimaryAction`'s; a day's `hoy` state arrives as `Chip tone="accent"`,
whose tint lives in `design-system/components/chips.css` where the system already argues
for it. A screen file that painted the accent itself would need an entry in the allow-list,
and `tests/` is outside T8's surface.

## The library is browsable, where it already was

T8 asks for «routines as cards, library browsable». The library's surface in this app has
always been the routine sheet's `Añadir un ejercicio` block: it lists every library row
with its own prescription line (`targetLine(defaultPrescription(exercise))`) and one tap
adds it to the day being edited. That block is unchanged and is still the browse surface —
the rows are the system's `DataRow`, so they already carry the redesign's hairline, badge
and target.

It was deliberately **not** hoisted onto the screen. The seeded library is 68 rows: a
read-only dump of it under the routine would be a list with no action, twice the length of
the screen, and it would promise a browsing feature (search, filter, open a detail) that
does not exist. Restyling the surface that can act on a library row is the redesign of
«library browsable» this task can honestly deliver; adding a second, inert list would be a
new screen, not a re-render. If T12 wants a library screen anyway, it is a product
decision with its own behaviour, not a stylesheet.

## The ground ramp and the depth

The same three steps Inicio uses, so the two screens read as one product:

```
canvas --color-bg  →  today's card --color-surface-raised  →  a routine day --color-surface
a day's badge --color-surface-raised   ·   a prescription panel --color-surface-raised
```

Depth is a tonal step plus `--color-hairline`. Nothing on this screen floats, so nothing
here carries a shadow. `train.css` no longer reads `--color-border` anywhere: the panel of
the editor's prescription and the two lists inside the sheet are closed by the hairline,
and the sheet's header is closed by the same line the tab bar uses.

## Mobile-first (S8)

- The screen inherits the shell's horizontal padding and adds no width of its own; every
  flex child that holds type carries `min-width: 0`, and a day's title uses
  `overflow-wrap: break-word` so `Peso muerto / Tracción` wraps instead of pushing the
  chevron out.
- At 720 px and up the screen is one 560 px column, the width Inicio and Sesión use at the
  same breakpoint, and the sheet's body narrows to 600 px inside its full-width sheet.
- The sheet keeps `--safe-top`, and its body keeps
  `calc(var(--space-8) + var(--safe-bottom))` as bottom padding. It is now the only
  scroller of the sheet (`flex: 1 1 auto; min-height: 0` on the body, `overflow: hidden` on
  the frame), so the header cannot be dragged out of reach.
- Touch targets: the primary is 56 px, the sheet's controls are the system's 48 px floor,
  and a routine card is never under 66 px.

Measured with the dev server (`http://localhost:5181/`) in Edge over CDP, demo states and
the real store:

| Measurement (390 × 844) | Value |
|---|---|
| `document.scrollWidth / clientWidth` | 375 / 375 (the window is 390; the 15 px is the desktop scrollbar) |
| `body.scrollWidth`, `.train` 335 / 335 | no sideways scroll |
| elements under `.train` crossing the viewport edge | **0** |
| `Ejercicios` | 39.9993 px (`--text-display`) |
| today's card / its primary | 335 × 166 / 301 × 56 |
| a routine day (with `hecha`) / (plain) | 333 × 94 / 333 × 74 |
| day title · badge · chip | 20.0005 px (`--text-card-title`) · 34 × 34 · 55 × 26 |
| the sheet's body at 390 | scrolls (3224 of 779), library card 320 wide, 16 rows, **0** elements crossing the edge |

| Measurement (768 × 1024) | Value |
|---|---|
| `document.scrollWidth / clientWidth` | 753 / 753 |
| the screen's column | 560 wide, centred (left 97) |
| today's card / a routine day | 560 / 558 wide |

## What did not change

- `RoutineEditor.tsx` has no markup change at all: the sheet is restyled by `train.css`
  (its lists, its header line, its prescription panel) and every control inside it is the
  one it shipped with.
- `editor.ts`, `selectors.ts`, `DemoTrain.tsx`, both test files, `startSession`, every
  storage read and the single `plan.save` write: untouched (`git status --short` shows them
  clean).
- The classification of a day (`statusOf`), the honesty rules around a plan day with no
  session, the `pendiente` suppression and the accessible names (`Pierna. Lunes · 12.660 kg
  · 52 min. hecha`) are the ones that were there, character for character.
- No data shape, storage, sync, route, dependency, design-system file, token, gallery entry,
  shell file or other feature folder.

## Notes for the next units

- **The title role is now uneven.** T8's brief says `train.css` carries no display token, so
  `Ejercicios` names itself at `--text-display` (40 px). `Historial` (`ProgressScreen.tsx`),
  `Resumen` and `Perfil` still open at `ds-screen-title` (32 px). One of the two is wrong
  for the product and T12 should pick: either every tab's own title moves to
  `--text-display`, or this one drops back to `ds-screen-title`. Nothing else in this file
  depends on the choice.
- `train.css` scopes nothing outside `features/train/`: it adds no override of a
  design-system rule, so there is no debt to move up in T12.
- The screen file no longer imports `DataRow`; the sheet still does, and still should.
