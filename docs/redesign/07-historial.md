# T7 — Historial (`features/progress/`)

The tab at `#/progreso` and its three drill-downs, composed for the dark premium direction
(`odd/tasks/dark-premium-redesign.md` T7, S1–S8). Presentation only: no aggregate, no
storage, no sync, no route and no writing rule changed.

## The composition, in reading order

| # | Block | Where it lives |
|---|---|---|
| 1 | Header: `Historial` and the segment control `Evolución · Sesiones · PRs` | `ProgressScreen.tsx` → `header.progress__top`, `parts.tsx` → `Segmented` |
| 2 | **Evolución**: the volume of the week + its 12-week line + the three counts | `ProgressScreen.tsx` → `Evolution` → `VolumeCard` |
| 3 | **Evolución**: body weight — the latest weigh-in, the chart, the way to add one | `ProgressScreen.tsx` → `WeightCard`, `WeightScreen.tsx` → `LastWeighInTile`, `WeightChart` |
| 4 | **Sesiones**: a screenful of compact rows, then the way into the complete list | `ProgressScreen.tsx` → `SessionsPanel`, `HistorialScreen.tsx` → `SessionRow` |
| 5 | **PRs**: the heaviest mark as the protagonist, then every record as a row | `ProgressScreen.tsx` → `RecordsPanel` |
| 6 | Actividad — the owner's football rows and their bin (T9), unchanged | `ProgressScreen.tsx` → `ActivitySection` |
| 7 | Drill-downs: `Todas las sesiones`, `Peso corporal`, exercise detail | `HistorialScreen.tsx`, `WeightScreen.tsx`, `ExerciseDetailScreen.tsx` |

The tab is titled **Historial** because that is what the bar has called it since T4. The
drill-downs now return to it (`‹ Historial`) and keep their own names: the complete list is
`Todas las sesiones` (it used to be called `Historial`, the same word as its parent), the
weight screen keeps `Peso corporal`, and the exercise detail keeps the exercise's name.
Their hashes, the `‹ ` control and the back behaviour are untouched.

## Where each figure comes from (S6 — nothing invented)

| On screen | Source at render time |
|---|---|
| `Historial`, `Evolución · Sesiones · PRs` | copy and the tab's own panel state |
| `4.260 kg` (the loud figure) | `weeklyVolume(sessions, { now }).lastVolumeKg` |
| `Semana del 16 nov · 1 sesión` | the last bucket's `start` and `sessions` (`WeeklyVolume.weeks`) |
| the purple line and its dots | `volume.weeks[].volumeKg`, twelve buckets, zeros included |
| `31 ago · 5 oct · 16 nov` | the same buckets' `start` through `formatDayMonth` (LineChart thins to three) |
| `4.260 kg` at the last point | `volume.lastVolumeKg` |
| `De 3.990 a 4.260 kg` | the first bucket with volume and the last one — no other arithmetic |
| `Sesiones 9` | `sessions.filter(isRecordedSession).length` |
| `Semanas con datos 9/12` | `volume.weeksWithVolume` / `volume.weeks.length` |
| `Series duras 6` | `volume.lastHardSets` (this week's sets at ≤ 1 RIR with an answered effort) |
| `80,9 kg` (último pesaje) | `weightSeries(measurements, now).last.weightKg` |
| `16 nov · media de 7 días con 4 pesajes` | the same series' `last.dayStart`, `meanKg`, `meanSamples` |
| the weight chart | `series.points[]` + `weightLineDecision` (points, never a line, when there are holes) |
| `7 pesajes` | `series.points.length` in the window |
| `Añadir un pesaje` | the row opens `#/progreso/peso`, where `WeightEntryForm` already writes |
| `Empuje / Pecho` (row title) | `session.dayNameSnapshot` (the snapshot, not the plan day) |
| `Lunes 16 · 6 de 6 series` | `session.scheduledDate` + `sessionSummary(...)`'s `setsConfirmed` / `setsPrescribed` |
| `4.260 kg` (row figure) | the same summary's `volumeKg` |
| `9 registradas` | `historySessions(sessions).length` |
| `Mejor marca · Sentadilla trasera · 105 kg × 8 reps · 16 nov 2026` | `topRecord(personalRecords(sessions))`: `exerciseName`, `weightKg`, `targetReps`, `achievedAt` |
| one row per record | `personalRecords(sessions)`, newest first, one per exercise × target reps |
| `2 marcas` | `records.length` |

No percentage, no delta, no goal and no "trend" appears that a stored or derived number does
not carry. A week without a session is the `0 kg` `weeklyVolume` wrote — the chart's note
says so — and the volume figure never claims a comparison the aggregate refuses
(`enoughToCompare`).

## The states, honestly

- **Nothing trained, nothing weighed**: one primary empty state (`Empezar entrenamiento`)
  plus the one way in it cannot offer — the first weigh-in (`Peso corporal`). The segment
  stays, the panels do not draw zeros.
- **Sessions but no weigh-ins**: `Peso corporal` says `Todavía no hay pesajes…` and draws no
  curve; the entry row stays.
- **Weigh-ins but no sessions**: `Volumen semanal` is the `sin datos` card — `El volumen
  aparece con la primera sesión registrada. No se dibuja una línea plana.`
- **One week with volume**: the figure and the sentence `Con un punto no se dibuja una
  tendencia` instead of a line.
- **No records**: `sin marcas` and the sentence that defines what a record is.
- **Sesiones**: with no recorded session the panel says so; above eight rows it says how
  many of how many are shown.

## The accent budget

`tests/accent-budget.test.ts` is unchanged and green. **`progress.css` declares no accent at
all**: the purple of both charts is `--color-chart-1`, painted by
`design-system/components/charts.css`, and the segment's chosen option is a tonal step
(`--color-surface-raised` + `--color-border`) with `font-weight` and `aria-pressed` doing the
rest. The screen's one filled control remains `EmptyState`'s `Empezar entrenamiento`.

## What did not change

- `aggregates.ts`, `weightEntry.ts`, `weightSave.ts`, `summary.ts`, `format.ts`,
  `navigation.ts`, `exerciseDetail.ts`, `deleteFlow.ts`: byte-identical.
- No storage, sync, route, dependency, token or design-system file.
- No route or drill-down navigation: `#/progreso/historial`, `#/progreso/peso`,
  `#/progreso/ejercicio/<key>` keep their hashes and their `‹ ` control. The complete list
  keeps the month groups, the totals, the per-exercise loads and the two-tap deletion; a
  session read-out from the tab is the same `SessionReadOut` the drill-down renders, so the
  deletion it cannot offer is the only difference.
- Every chart keeps its hidden data table (`ChartFrame`), so the numbers stay readable
  without the SVG: the volume table has the twelve buckets, the weight table every weigh-in.
- The activity section (T9) is untouched in place and in copy.

## Notes for the next units

- The tab no longer plots `strengthSeries`. The aggregate and its tests are untouched — the
  per-exercise strength line lives in the exercise detail, which is where a lift is read —
  but no screen imports it today. If T8/T10 want a strength panel back, the aggregate is
  still there.
- `progress.css` scopes two design-system rules with a comment each: the strip's label
  height in the volume card (so the three figures share one baseline when `Semanas con
  datos` wraps at 320) and the row geometry of the session/PR rows. Neither touches
  `design-system/**`.
- The gallery (`#/galeria`) shows `DataRow`, `DataStrip`, `ChartFrame`, `LineChart`,
  `MetricTile` and `EmptyState` unchanged, so it still tells the truth: T7 added no
  design-system component and no token.

## How this was verified

Dev server at `http://localhost:5180/`, Edge `--headless=new --remote-debugging-port=9223`
over CDP (no MCP browser tool), viewports 320 × 844, 390 × 844 and 768 × 1024. The store was
seeded through its own ports (`createStorage()` + `sessions.create` / `confirmSet` /
`finish` / `measurements.save` from an in-page `import('/src/storage/index.ts')`): nine
sessions over twelve weeks, seven weigh-ins with gaps. No fixture ships in the app.

`document.documentElement.scrollWidth === clientWidth` in all 18 states:

| Viewport | Evolución | Sesiones | PRs | Todas las sesiones | Peso corporal | Ejercicio |
|---|---|---|---|---|---|---|
| 320 × 844 | 320 / 320 | 320 / 320 | 320 / 320 | 320 / 320 | 320 / 320 | 320 / 320 |
| 390 × 844 | 390 / 390 | 390 / 390 | 390 / 390 | 390 / 390 | 390 / 390 | 390 / 390 |
| 768 × 1024 | 753 / 753 | 753 / 753 | 768 / 768 | 753 / 753 | 753 / 753 | 753 / 753 |

(At 768 the classic scrollbar leaves 753 CSS px where the page scrolls; PRs is short enough
not to scroll, and the two numbers still match. `document.body.scrollWidth` equals the same
value in every row.)

- A rect probe over every element (excluding the charts' hidden tables, which are
  `position: fixed` and clipped by `ds-visually-hidden`) reports **0** elements crossing the
  viewport edge in every state.
- Measured geometry at 390: the segment is 350 × 54 with three 113 × 48 options; the
  volume card is 350 wide (and its chart 308 × 144); a session row is 70 px in both lists;
  the loud volume figure is 44 px (`--text-metric`); a PR row is 68–69 px with the weight at
  26 px (`--text-metric-sm`). At 768 the tab is a centred 560 px column, the width Inicio
  uses at the same breakpoint.
- At 320 the long names (`Sentadilla / Pierna`) wrap to two lines in the tab's rows; nothing
  clips, nothing scrolls sideways.
- `npm run typecheck`, `npm run build` and `npm test` (1212 tests, 79 files) are green.
