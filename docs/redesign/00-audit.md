# Rupfit — Phase 1 audit (redesign baseline)

Read-only audit before any visual change. Evidence paths are relative to the repo root.

## Stack

- React 19.3.1 + TypeScript 5.9.3 (strict, `exactOptionalPropertyTypes`), Vite 8.3.6 + `vite-plugin-pwa`.
- No UI, icon, chart, router or state library: hand-written CSS, hand-rolled hash router
  (`src/app/routes.tsx:33-49`), bespoke inline SVG icons (`src/design-system/components/Icon.tsx`),
  hand-written SVG charts (`src/design-system/components/Charts.tsx`).
- One context carries storage, clock, journal and cloud (`src/app/providers.tsx:26-45`).
- Entry: `index.html` → `src/main.tsx` (loads `design-system/tokens.css` + `app/shell.css`) → `src/app/App.tsx`.

## Design tokens — a real layer already exists

`src/design-system/tokens.css` is the single source; components use `var(--…)` only.

- Dark (default): `--color-bg:#12111b`, `--color-surface:#1b1a27`, `--color-surface-raised:#26243a`,
  `--color-border:#3b394f`, `--color-text:#f6f3ff`, `--color-muted:#b4b0c9`, `--color-subtle:#858098`.
- Purples: `--color-accent:#a892ff`, `--color-accent-ink:#171329`, `--color-accent-text:#bbaaff`,
  `--color-accent-muted:#30294d`; chart palette `#b39bff/#69b6ff/#67d2a8/#f0a875`.
- Light peer exists (`:root[data-theme='light']`, accent `#5734e6`) but **is never activated**:
  `data-theme` is set nowhere in `src`, and `index.html` hard-defaults dark.
- Type: system stack (`--font-sans: -apple-system … 'SF Pro Text'`), `--font-numeric: ui-rounded`.
  **No `@font-face` exists**, so the app renders the OS font.
- Space: 4px grid. Radii: `--radius-card:16px` (skin A 12px). **No shadow tokens**: two hard-coded
  shadows (`app/shell.css:155`, `design-system/components/rest-timer-bar.css:25`).
- Colour leakage into feature CSS: none. The exceptions are the baked SVG fills and `app/shell.css`.

## Brand assets (must not be redrawn)

- `public/logo-mark.svg` (single path, fill `#a892ff`), `public/logo-mark-ink.svg` (lilac disc),
  `public/logo-lockup.svg` (mark + wordmark as vector paths, fill `#f6f3ff`).
- Boot screen inlines a duplicate of the mark (`index.html:38-48`).
- Exercise art: three photographic `.webp` (`public/art/…`, mapped in `features/session/renderArtwork.ts`);
  everything else is a data-driven SVG pictogram (`features/session/pictograms.ts`, 687 lines).

## Screens — all six exist today

| Screen | Route / component |
|---|---|
| Inicio | `#/inicio` → `features/home/HomeScreen.tsx` (+ `home/agenda.tsx`) |
| Ejercicios | `#/entrenar` → `features/train/TrainScreen.tsx` + `RoutineEditor.tsx` |
| Entrenamiento | `#/sesion` → `features/session/SessionScreen.tsx` |
| Historial | `#/progreso` → `ProgressScreen.tsx`, plus `progreso/historial`, `progreso/peso`, `progreso/ejercicio/<key>` |
| Perfil | `#/perfil` → `ProfileScreen.tsx` |
| Resumen | `#/resumen/<id>` → `SummaryEntry.tsx` → `SummaryScreen.tsx` |

Extras: `#/empezar` setup gate, `#/galeria` component gallery (six section files).

## Reusable components

`src/design-system/components/` (16 components, barrel `design-system/index.ts`): Card/SectionLabel,
PrimaryAction/TextButton (tones quiet|accent|danger), Chip, DataRow, Metric/CompareTile/DataStrip,
Numeral, Stepper, SetRow/SetEditor (pending|active|confirmed|corrected|skipped), WeightEntry,
RestTimerBar (gallery only), Banner (4 tones), ErrorBanner, PhaseBanner, EmptyState, Pager, Icon, Charts.
Modals and sheets are feature-level, not shared (`home/agenda.tsx`, `train/RoutineEditor.tsx`,
`session/SessionScreen.tsx`); every state is mirrored in `#/galeria`.

## Data, persistence, sync (read-only for this work)

- IndexedDB (`idb`) is the source of truth: nine stores in `storage/records.ts:37-47`; entities in
  `storage/entities.ts` (`SetRecord`, `ExerciseSession`, `WorkoutSession`, `UserProfile`, `BodyMeasurement`).
- Access through ports: `storage/port.ts` and `storage/repositories/*` (`confirmSet`, `substitute`,
  `finish`, `recordDecision`, `delete`).
- `sessionStorage` holds a crash journal for the open card; `localStorage` holds a launch marker and
  cloud migration markers. Supabase sync is optional, queued through an outbox, wired only from
  `ProfileScreen.tsx`.

## Behaviour that must not change

- **No rest timer in the session**: logging a set never blocks. Prescribed rest is text only.
- Write-first, serialised dispatch; the reducer owns refusal (`features/session/controller.ts`).
- Pinned action bar with one accent fill; swipe between exercises; 500 ms hold-to-correct; closing verdict.
- PRs are derived on read, never stored (`features/progress/aggregates.ts:415`); nothing is cached.
- Body weight: validate → read day → single `put` (`progress/weightSave.ts`).

## Tests and checks

Vitest 5.1.0, `npm test` = `vitest run`; 66 test files (61 under `src/`, 5 in `tests/`). Scripts
`dev`, `build` (typecheck + build), `preview`, `test`, `typecheck`. **No lint script**, no ESLint or
Prettier configured. CI runs test → typecheck → build (`.github/workflows/pages.yml`).

## Re-skin in place

Card, DataRow, Chip, Banner, EmptyState, Pager, SectionLabel, PrimaryAction, TextButton, Stepper,
Numeral, Metric, DataStrip, CompareTile, Icon set, pictograms, charts, Perfil groups, Setup/Account,
Historial rows, Inicio week rows, Resumen sheet.

## Needs a new visual implementation

`SessionScreen.tsx` (1413 lines) + `session.css` (742) + `ExerciseCard.tsx` (489);
`ProgressScreen.tsx` (869) + `progress.css` (349); `profile.css` (302); `home.css` (129) +
`home/agenda.css`; the feature sheets (DaySheet, MatchSheet, RoutineSheet, SessionExit);
`index.html` boot screen and `Splash.tsx`; `#/galeria` section files.

## Blockers found

1. Baked brand fills: the lockup (`#f6f3ff`) is invisible on a light canvas and cannot be recoloured from CSS.
2. The light theme is unreachable dead code (`data-theme` never set).
3. `app/shell.css` reads `--text-card-title` and `--leading-card-title`, which `tokens.css` never defines.
4. No desktop story: 13 media queries, none for wide screens; no max-width container.
5. Size concentration: the session and progress screens are single files of 800-1400 lines, so a
   restructure risks behaviour.
6. Conflicting docs: `docs/design-system.md` describes a lime "skin B" as default while the shipped
   tokens are violet; `design/system.md` is a generated snapshot that must be regenerated.
