# T10 — Resumen (`features/summary/`)

The sheet that closes a session (`#/resumen/<id>`, and `#/resumen/demo` over the fixture
week), composed for the dark premium direction (`odd/tasks/dark-premium-redesign.md` T10,
S1, S4, S6, S8). Presentation only: `selectors.ts`, `SummaryEntry.tsx`, `route.ts` and
`selectors.test.ts` are byte-identical, so no aggregate, no derived figure, no read and no
write changed — `sessions.finish` still happens exactly where it did.

The redesign had never touched this screen: `summary.css` read no hairline, no raised ground
and no display role, and it was the one screen stylesheet the redesign had not reached. It has
them now, and nothing else.

## The composition, in reading order

| # | Block | Where it lives |
|---|---|---|
| 1 | Header: the date in the eyebrow, `Sesión completada` / `Sesión parcial` at the display role | `SummaryScreen.tsx` → `summary__head` |
| 2 | The write error and `Reintentar` — unchanged | `ErrorBanner`, as before |
| 3 | **The protagonist**: the day, the records of the day as a chip, the volume as a figure, then `Series` and `Duración` | `SummaryScreen.tsx` → `summary__hero` (`MetricTile` + `DataStrip`) |
| 4 | **Récords de la sesión**, each with the accent-tinted `RÉCORD` chip, its day, the mark at the title role and its comparison | `SummaryScreen.tsx` → `summary__record` |
| 5 | The sentence for a session without a mark | `EmptyState` `bare` → `summary__no-records` |
| 6 | **Ejercicios**: the read-out of the session, sets on demand | `SummaryScreen.tsx` → `ExerciseRow` (`DataRow` + `summary__sets`) |
| 7 | `Hecho`, pinned above the home indicator | `SummaryScreen.tsx` → `summary__bar` |

Two things changed places, and only those two:

- **The volume left the three-cell strip and became the figure of the raised card.** The
  strip is now `Series` and `Duración`. The three totals used to be three equal cells, which
  is a table, not an ending; the sheet now answers "how much did I move" first and "in how
  long, out of how many sets" under it. No number was added or dropped: the same three
  values are on the screen, one of them once.
- **The records stopped being rows of the exercise list's shape.** They are blocks: the word,
  the day, the mark at the title role, the comparison as the caption. A row would put a
  `92,5 kg × 10` mark into the same value column as an exercise's volume and make the two
  read as the same kind of fact, which they are not.

## Where each figure comes from (S6 — nothing invented)

| On screen | Source at render time |
|---|---|
| `LUNES, 17 NOV` | `formatEyebrowDate(session.scheduledDate)` |
| `Sesión completada` / `Sesión parcial` | `summaryOutcome(session)` |
| `EMPUJE / PECHO` → `Empuje / Pecho` | `session.dayNameSnapshot` through `formatDayName` |
| `2 récords` (the chip) | `view.records.length` — the length of the list below, counted |
| `8.280 kg` (the loud figure) | `view.totals.volume` = `formatVolume(sessionVolumeKg(session))` |
| `8/9` | `confirmedSetCount(session)` / `prescribedSets(session)` |
| `52 min` | `formatDuration(sessionDurationMs(session))`, or `—` when the store cannot prove one |
| `Guardada como parcial…` | `view.note`, the sentence the selector writes for a partial |
| `RÉCORD` | the record's own existence (`view.records`), nothing else |
| `hoy` / `6 nov` | `record.when` (`sameDay` against the clock, else `formatShortDate`) |
| `Peso muerto · 92,5 kg × 10` | `record.line` — the exercise snapshot, the top set's weight and reps |
| `Mejor marca en 10 repeticiones. Antes: 90 kg.` | `record.detail` — `previousBest(...)` over the history |
| `Sin récords hoy…` | `view.noRecords` |
| `3 ejercicios` | `view.exercises.length` — the length of the list under it |
| the exercise rows | `view.exercises`: `name`, `icon`, `subtitle`, `volume`, `sets[]` |

## The comparison the screen shows, and the ones it refuses

The only comparison on the sheet is the one the app already computes: **`Antes: 90 kg`**
inside `record.detail`, which is `previousBest` reading the stored history for the same
exercise at the same rep count or more. It is a fact about a session that actually beat a
mark, and it is a sentence — no arrow, no percentage, no colour that has to be decoded.

Refused, deliberately, because `SummaryView` does not carry them and inventing them would
break S6:

- No **variation** against the previous session or the previous week (`+7,5 %`, `−320 kg`):
  nothing in the app computes a session-to-session delta for this screen, and
  `summaryViewOf` does not return the neighbouring session's volume.
- No **percentage of the plan** (`92 % de lo prescrito`). `8/9` is the pair that exists;
  a percentage of it would be a second derived figure nobody asked the store for.
- No **streak, level, badge, or "mejor sesión del mes"**: the summary reads one session and
  a 20-session window for records. It does not rank sessions.
- No **estimated 1RM, tonnage per muscle, or intensity score**, and no **rest** anywhere
  (S5): this screen has never shown a timer and gains none.
- No **count of "series duras"** here, even though Historial derives one: the summary's
  stored row does not carry the effort answer, so the number would be invented.
- No **empty chart**. A duration the store cannot prove is `—`, not `0 min`; a session
  without a mark says so in words instead of drawing a zero.

## The hierarchy of figures

| Role | Token | Spent on |
|---|---|---|
| Display, 40 px, bold, −1 px tracking | `--text-display` / `--leading-display` / `--tracking-display` | `Sesión completada` — the one place in the app a finished thing is stated at display size |
| Metric, 44 px, bold, tabular | `Numeral size="metric"` (`--text-metric`) | the session's volume — the same role Historial gives its weekly volume and its best mark |
| Title, 22 px, semibold, tabular | `--text-title` | the mark of a record (`Peso muerto · 92,5 kg × 10`) |
| Body, 17 px | `--text-body` | the exercise titles, the set figures (`10 × 92,5 kg`, tabular `--font-numeric`) |
| Caption, 12 px | `--text-caption` | the comparison, the partial note, the counts |
| Section label, 13 px, uppercase | `--text-label` | the date, the day, `Volumen`, `Récords de la sesión`, `Ejercicios` |

`--text-numeral-load` (60 px) and `--text-numeral-reps` (44 px) are **not** spent here. Those
two are the session's own roles — the load on the bar and the reps being logged, where a
thumb is entering a number. The summary prints a total nobody edits, so it uses the metric
role that Historial already spends on the same kind of figure. The type scale needed nothing
new.

## The accent budget

`tests/accent-budget.test.ts` is **unchanged and green**, and its allow-list still contains no
entry for `features/summary/summary.css`, because **that file declares no accent at all** —
it never did, and this unit did not ask for an exception.

The purple of the sheet comes from components that already own it:

- the `RÉCORD` chip and the `2 récords` chip are `Chip tone="accent"` — a **tint**
  (`color-mix` over the raised ground) with the accent-ink word, painted by
  `design-system/components/chips.css`, never a fill;
- `Hecho` is the sheet's **one accent fill**, unchanged, in the pinned bar.

So the celebration is a tinted word plus a 40 px title, not a second purple slab: a screen
with two accent fills has no accent left to point at.

## Mobile-first, and the wide window (S8)

- `390` and `768` cannot scroll sideways: `.summary` is `overflow: hidden`, the read-out
  region is `overflow-x: hidden` (it scrolls down and only down), and every text block that
  can be a user-created name carries `overflow-wrap: anywhere`. The two cells of the strip
  and the two figures that never wrap (volume, series) are sized by content that already
  fits: at 320 px the widest possible value, a seven-digit volume at 44 px, is ~215 px inside
  the 248 px card.
- The hero's head is `space-between` with `min-width: 0` on the day and `flex: none` on the
  chip: a long plan name wraps, the chip keeps its word.
- The exercise row keeps the design system's **inline** value size on purpose. The row carries
  a 34 px badge and a chevron, so at 320 px its name column is ~95 px; promoting the figure to
  the 28 px numeral role would leave it 41 px — two letters of `Sentadilla`. The volume is in
  primary ink instead of muted, which is what makes it findable without spending the column.
- Targets are the system's: every exercise row is a real button over the 48 px floor, the chip
  is a static pill, and `Hecho` is the 56 px control.
- Safe areas: the sheet keeps `padding-top: var(--safe-top)` and the bar keeps
  `padding-bottom: var(--safe-bottom-padding)`, so `Hecho` never sits under the home
  indicator. `--safe-left` / `--safe-right` are untouched — no screen in the app spends them,
  because a phone on its side is stopped by the shell's landscape notice.
- At ≥ 720 px the read-out and the one action share the 560 px column Inicio and Historial
  use; the bar itself stays full width, since its hairline closes the sheet and not the
  column.
- New depth is the shipped ramp and nothing else: the hero is `--color-surface-raised`, the
  cards are `--color-surface` with `--color-hairline`, the bar is closed by the same hairline,
  and there is no shadow anywhere on the screen.

## What did not change

- `selectors.ts`, `selectors.test.ts`, `SummaryEntry.tsx`, `route.ts`: byte-identical. No
  aggregate, no `previousBest`, no `summaryOutcome`, no reading window, no `sessions.finish`.
- The demo route (`#/resumen/demo`) still reads through the same code path; its strip keeps
  its own stylesheet and only the gutter of `summary__top` is this file's business.
- Nothing outside `src/features/summary/**` was touched: no token, no
  `design-system/components/**`, no `app/shell.css`, no gallery, no test, no dependency.
- No token was found missing, and none was requested. `--text-display` was defined by T3 and
  spent by no screen until this unit; `--text-card-title`, the four shadows, the ground ramp
  and `--color-hairline` all already existed.
- The accessible names of the sets toggle, the records group and every row are the same
  strings as before; only their containers changed. `SectionLabel` is an `h2`, so the sheet
  reads `h1` (the title) → `h2` (Récords) → `h2` (Ejercicios), and the totals card no longer
  repeats the day in both its `aria-label` and its visible heading.

## How this was verified

Focused, no browser, no full suite:

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0 |
| `npx vitest run src/features/summary/selectors.test.ts tests/accent-budget.test.ts` | exit 0 — 2 files, 30 tests |

There is no vitest file that covers `SummaryScreen.tsx` (`grep -rl "SummaryScreen" src
--include=*.test.tsx` finds none), so the derived figures are pinned by the selector test and
the stylesheet budget by the accent probe. The viewport sweep — 390 and 768, no horizontal
scroll, contrast, rect probe — belongs to T12 and was **not** run here; the geometry above is
arithmetic on the tokens, not a measurement.
