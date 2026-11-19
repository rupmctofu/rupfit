# T5 — Inicio (`features/home/`)

The screen that answers «¿qué toca hoy?», composed for the dark premium direction
(`odd/tasks/dark-premium-redesign.md` S1–S8). Visual work only: no behaviour, no data
source, no stored shape changed.

## The composition, in reading order

| # | Block | Where it lives |
|---|---|---|
| 1 | Header: the lockup, the greeting, one way into the settings | `HomeScreen.tsx` → `header.home__head` |
| 2 | Today's workout — the protagonist card | `HomeScreen.tsx` → `HomeToday`, derived by `today.ts` → `todayHeroOf`, artwork by `todayArtwork.ts` |
| 3 | The week's progress: `doneCount` / plan days, one bar, the seven days | `HomeScreen.tsx` → `HomeWeekProgress`, derived by `today.ts` → `weekProgressOf` |
| 4 | The week: the same dated rows as before | `agenda.tsx` → `AgendaWeek` (unchanged behaviour) |

Everything the week cannot say keeps its place under the rows: the kilos of the last
session (one line) and the two notices that are not decoration. The notices moved *above*
the card: a start that failed and a store that came back empty are read before what to do
today.

## Where each figure comes from (S6 — nothing invented)

| On screen | Source |
|---|---|
| `Hola, Rup` | `OWNER_NAME` through `greeting()` (`src/core/owner.ts`): the name is the app's, not the account's, and it is not editable |
| `HOY · LUNES`, `Pierna` | the agenda's today row (`rowTitleOf`, `AgendaDay.weekdayName`) |
| `Ejercicios 9` / `Series 20` | the same row's `exerciseCount` / `setCount` (the plan day's prescription) |
| `Readaptación · semana 1 de 4` | `TodayView.phase`, as before |
| the picture | the library's `illustration` key of the day's first drawable exercise (`SEED_EXERCISES` + `ExerciseIllustration`) |
| `1 de 4 entrenos` | `WeekAgenda.doneCount` over `WeekAgenda.planDays.length` — the tally `features/week/agenda.ts` already documents |
| the bar's width | that same pair, rounded to a percentage and never the only carrier (the words are next to it) |
| the seven day cells | `WeekAgenda.days[i]` with `stateWordOf` for the accessible sentence |
| `Empezar entrenamiento` | `HomeView.action` (unchanged label), gated by `AgendaWeekView.action` |

The cards stay honest in the states that exist: no plan → the card is the empty state with
the sentence Inicio already used; a day with no exercises → `Sin ejercicios todavía.`; the
match and the rest day → their own title and the row's own second line; a zero week → `0 de
4 entrenos` and no bar fill (a real zero, never a fake one).

## The one action of the screen

The primary action moved from the today row into the card, and it is still the same
`onStart(planDayId)` the row called (`start.start` resumes an open session before it looks
at the requested day, so both branches are safe). While a sheet is open the card hides it,
so the sheet's confirm stays the only filled control (§7.1). The match keeps its report on
its own row: a match day is not a workout and the card offers nothing to start.

## Accent budget

`tests/accent-budget.test.ts` is unchanged and green. `home.css` uses only the four
declarations that file already allows for this screen, each with its role in a comment:

- `border-color: var(--color-accent)` and `color: var(--color-accent-text)` — today's row
  and today's cell in the strip (the data point the screen exists to answer);
- `background: var(--color-accent-muted)` — the tinted today cell, the selected option of
  the fixture sheet, and the bar's track (the drop target this bullet used to name went with
  the drag, below);
- `color: var(--color-accent)` — the bar's fill, painted with `background: currentColor`
  so the accent is spent on one line. **If T12 prefers the direct form**
  (`background: var(--color-accent)`), the allow-list in `tests/accent-budget.test.ts`
  needs that entry; the line was left as it is because `tests/` is outside T5's surface.

## What did not change

- `homeViewOf` and every selector: the screen still renders a view it did not compute.
- `agenda.tsx`: the fixture sheet and the match report, the two things a row still
  opens. The rows lost their `PrimaryAction` (the card carries it) and gained a
  visible `La semana` label; `starting`/`onStart` left `AgendaWeek` with the action.
  The tap into the day sheet and the drag between days are not part of the screen any more:
  they were removed on 2026-11-18, when the week stopped being a stored placement and began
  to be derived from the fixture's template on every read (`odd/tasks/derived-week.md` S2,
  S4). A row cannot be moved, so nothing offers to move it; `home.css` still carries the
  `--over` rule the gesture used to paint.
- No route, no store, no persistence, no sync, no dependency, no design-system file, no
  token. The light theme and the brand SVGs are untouched.

## Notes for T6 (Sesión)

- `--text-numeral-load` / `--text-numeral-reps` are still unspent; the card here uses
  `--text-title-lg` for its title and `DataStrip` (26 px) for its counts, so the session is
  free to take the big numerals without competing with Inicio.
- The tonal ramp used here: canvas `--color-bg` → card `--color-surface-raised` → artwork
  plate `--color-surface`. The session should keep its own ground one step lower than its
  card, or the two screens stop reading as one product.
- `ExerciseIllustration` is reused as-is (approved WebP where the library has one, the line
  pictogram otherwise) and is always inside an `aria-hidden` plate here; the session already
  gives the picture its own label, so do not copy that wrapper blindly.
- The artwork scale trick (`transform: scale(1.08)` on an approved cut-out inside an
  `overflow: hidden` plate) is what makes a 512 px cut-out fill a 104 px frame; the
  pictograms take no scale.
- One primary action per screen is still the rule, and `AgendaWeek` no longer draws one:
  if the session needs a second filled control, it needs a different shape.

## How this was verified

Dev server at `http://localhost:5180/`, Edge headless over CDP (`--remote-debugging-port=9222`),
viewport 405×844 so the classic scrollbar leaves exactly 390 CSS px of layout width.

- 390: `document.documentElement.scrollWidth == clientWidth == 390`;
  `.shell__main` 390/390. 768: 768/768 in both.
- The card's bottom edge sits at 398 px at 390×844: today's workout is above the fold.
- Touch targets: settings 48 × 48, the card's action 316 × 56, an agenda row 56 px tall.
- `Ajustes` → `#/perfil`. The row tap and the drag this check exercised belong to the build
  of that day: both were removed on 2026-11-18 with the stored placement
  (`odd/tasks/derived-week.md` S4), so a repeat of the check has nothing to tap open and
  nothing to drag — the rows open the fixture sheet and the match report, and the seven
  days come from the template of the week's fixture. What still holds is the `inert`
  background and the card's action disappearing while a sheet is open.
- IndexedDB (`rupfit` → `meta` → `week`) was written by hand to reach the rest-day card — a
  week row with `match: 'none'` frees Thursday — and returned to the league template
  afterwards. The `weekLayout` row this check wrote is unread since 2026-11-19
  (`odd/tasks/backlog-closeout.md` T4). No fixture data ships in the app.
