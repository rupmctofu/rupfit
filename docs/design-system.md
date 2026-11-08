# Rupfit — Design System

Status: specified, not implemented. Phase F2 produces an artboard for the training
screen and must be reviewed by the owner before UI code starts (roadmap F2).

Goal, in the owner's words: *"parezca un producto premium, no una plantilla genérica
de una aplicación de gimnasio"* — while the training screen stays usable at 1.5 m
from a rack, in dim light, with one hand.

---

## 1. What we take from the references (and what we deliberately reject)

| Product | Pattern worth taking | Rejected |
| --- | --- | --- |
| Apple Fitness | One accent colour, generous type, a single primary action per screen | Ring metaphors that imply a target to close every day |
| Gentler Streak | Calm surfaces, one metric per card, restrained motion | Trend advice based on proprietary scores |
| Strong / Hevy | Two-tap set logging, previous-performance always visible, inline weight edit | Dense toolbars, exercise illustrations as decoration, ad-driven layout |
| Athlytic | Honest data provenance, explicit "no data" states | Dense dashboards that require interpretation before training |

Cross-cutting conclusion: the app is **one screen doing one job at a time**. The
training screen has exactly one primary action; everything else is secondary and
visually quieter.

---

## 2. Layout

- Base grid: 4 pt. All spacing is a multiple of 4.
- Screen padding: 20 pt horizontal (16 pt when the width is under 375 pt).
- Card padding: 20 pt.
- Minimum touch target: 44 × 44 pt (Apple), primary actions 56 pt tall.
- Content is bottom-anchored where the action matters: the primary action sits in
  the thumb zone, not at the top.
- Safe areas respected; the rest timer bar is a bottom overlay above the home
  indicator, never under it.
- Supported sizes: iPhone SE (4.7", 375 × 667) through 6.9" (~440 × 956). Layout is
  a single column that breathes with width; no fixed pixel layouts.

```
┌───────────────────────────────┐
│  navigation title             │  17 pt · secondary
├───────────────────────────────┤
│                               │
│  exercise card (paged)        │  fills available height
│  name · previous · suggested  │
│  sets · one-line reason       │
│                               │
├───────────────────────────────┤
│  [ ◀ ]  Ejercicio 2 de 6  [ ▶ ]│  44 pt targets, always visible
├───────────────────────────────┤
│  ██ Aceptar 102,5 kg ███████  │  primary action, 56 pt
├───────────────────────────────┤
│  Descanso 1:45  +15s  Saltar  │  rest bar, 60 pt, only while resting
└───────────────────────────────┘
```

---

## 3. Colour

Dark is the default theme (gyms are dim; the screen is glanced at, not read). Light
is a full peer, not an afterthought. Only **one** accent hue exists.

### Dark

| Token | Hex | Use |
| --- | --- | --- |
| `bg.base` | `#101214` | App background (charcoal, not absolute black) |
| `bg.surface` | `#171A1D` | Cards |
| `bg.raised` | `#22262A` | Sheets, controls, pressed states |
| `stroke.hairline` | `#303438` | 1 pt separators, card borders |
| `text.primary` | `#F0F1EB` | Headings, weights, numbers |
| `text.secondary` | `#92969D` | Labels, reasons, metadata |
| `text.tertiary` | `#6F757C` | Disabled, timestamps |
| `accent` | `#B8F34A` | Primary action, selection, active state, progress |
| `onAccent` | `#101214` | Label on accent fill |
| `accentText` | `#B8F34A` | Accent used as text on dark |
| `accentMuted` | `#26301B` | Recommended weight, today cell, selected surfaces |
| `success` | `#B8F34A` | Set complete, PR — **one green only** |
| `warning` | `#E8B85C` | Recovery advisory, missing effort |
| `danger` | `#E47777` | Pain, destructive confirmation |

### Light

| Token | Hex | Use |
| --- | --- | --- |
| `bg.base` | `#F7F7F9` | App background |
| `bg.surface` | `#FFFFFF` | Cards |
| `bg.raised` | `#EEF0F3` | Sheets, pressed states |
| `stroke.hairline` | `#E3E5EA` | Separators |
| `text.primary` | `#111315` | Headings, numbers |
| `text.secondary` | `#5A6270` | Labels |
| `text.tertiary` | `#6E7787` | Disabled |
| `accent` | `#4E6A00` | Primary action |
| `onAccent` | `#FFFFFF` | Label on accent fill |
| `accentText` | `#405700` | Accent as text |
| `accentMuted` | `#EDF2DB` | Recommended weight, today cell |
| `success` | `#1A6B42` | Set complete, PR |
| `warning` | `#7A5300` | Recovery advisory, missing effort |
| `danger` | `#B3261E` | Pain, destructive confirmation |

### Contrast, measured (not claimed)

Computed with the WCAG 2.1 relative-luminance formula on 2026-11-08:

| Pair | Ratio | Requirement | Result |
| --- | --- | --- | --- |
| dark: `text.primary` / `bg.base` | 16.53:1 | 4.5 | pass |
| dark: `text.secondary` / `bg.surface` | 5.88:1 | 4.5 | pass |
| dark: `text.tertiary` / `bg.surface` | 3.75:1 | 3.0 | pass |
| dark: `onAccent` / `accent` | 14.26:1 | 4.5 | pass |
| dark: `accentText` / `bg.base` | 14.26:1 | 4.5 | pass |
| dark: `accent` / `accentMuted` | 10.49:1 | 3.0 | pass |
| dark: `danger` / `bg.surface` | 5.99:1 | 4.5 | pass |
| dark: `success` / `bg.surface` | 13.28:1 | 3.0 | pass |
| light: `text.primary` / `bg.surface` | 18.62:1 | 4.5 | pass |
| light: `text.secondary` / `bg.surface` | 6.15:1 | 4.5 | pass |
| light: `onAccent` / `accent` | 6.20:1 | 4.5 | pass |
| light: `danger` / `bg.surface` | 6.54:1 | 4.5 | pass |
| light: `success` / `bg.surface` | 6.51:1 | 3.0 | pass |
| light: `warning` / `bg.surface` | 6.85:1 | 3.0 | pass |

**Colour is never the only carrier of meaning.** A PR is not "the green number"; it
carries the word `RÉCORD`. Pain is not a red row; it carries `dolor`.

Chart series (max 4, distinguishable for deuteranopia): `#B8F34A`, `#4C9AFF`,
`#B39DFF`, `#6FD08C` — always paired with a direct label, never a legend alone.
The estimated series is the dashed violet one; green was too close to the lime accent
to be told apart (`design/README.md`, Skin B).

---

## 4. Typography

SF Pro via system text styles, so Dynamic Type and VoiceOver work by construction.
Weights: Regular, Medium, Semibold. Never Bold for body text.

| Role | Style | Size / leading | Notes |
| --- | --- | --- | --- |
| Screen title | `.largeTitle` / custom | 34 / 40 | One per screen |
| Card title (exercise name) | `.title2` semibold | 22 / 28 | Truncate at 2 lines, never shrink to illegible |
| Metric (weight, timer) | `.system(size: 44, weight: .semibold, design: .rounded)` | 44 / 48 | Monospaced digits, no locale guessing |
| Section label | `.footnote` medium | 13 / 18 | Uppercase, `text.secondary`, tracking 0.5 |
| Body | `.body` | 17 / 22 | Reasons, descriptions |
| Meta | `.subheadline` | 15 / 20 | "Sesión anterior · 100 kg × 6" |
| Caption | `.caption` | 12 / 16 | Provenance, timestamps |

Rules:

- All numeric weights, reps and timers use `.monospacedDigit()` so a change from
  100 to 102.5 does not shift the layout.
- No font below 12 pt, ever.
- Layout must survive Dynamic Type up to XXL; cards grow, nothing clips, and the
  primary action stays reachable (worst-case layout is a design review item).

---

## 5. Spacing, radius, elevation, motion

```swift
enum Space { static let xxs=4.0, xs=8.0, s=12.0, m=16.0, l=20.0, xl=24.0, xxl=32.0 }
enum Radius { static let card=16.0, sheet=16.0, control=12.0, button=999.0 }
```

- Elevation: none except sheets and the rest bar, which use `bg.raised` plus a
  1 pt top hairline. No drop shadows in the content area.
- Motion: 180 ms `easeOut` for state changes, 260 ms spring for card paging.
  **Confirming a set is instant** — no animation may delay the confirmation.
- `Reduce Motion` removes paging animation entirely and switches to a crossfade.
- Haptics: `.light` on set confirm, `.success` on PR, `.warning` on rest end. Haptics
  are additive, never the only feedback.

---

## 6. Components

Each component lists anatomy and the states that must exist. A component without an
empty, error and loading decision is not finished.

### 6.1 `PrimaryAction`

- 56 pt tall, full width, `accent` fill, `onAccent` label, `Radius.button` (pill).
- Optional leading icon (`play.fill` on "Empezar entrenamiento"); the icon never
  replaces the label.
- States: enabled, pressed (opacity 0.85), disabled (`text.tertiary` on `bg.raised`),
  loading (never used: no action here waits on the network).
- One per screen. If two actions compete, one becomes a text button.

### 6.2 `ExerciseCard`

- Anatomy: name, a solid `accent` muscle chip plus a neutral equipment chip, two
  comparison tiles (`Última vez` / `Peso de hoy`, the second on `accentMuted` with an
  `accent` border), one-line reason, a `SessionHistoryStrip` of the last six
  sessions, set rows, and a secondary `Cambiar el peso` text button. The session
  position lives in the pager, not here (§10 forbids showing it twice).
- States: first-time (no history, "elige un peso"), insufficient data, suggested,
  user-overridden, completed, skipped.
- Paging: horizontal `TabView(.page)` with pinned chevrons. Swipe is a shortcut,
  never the only route (FR-6.2).
- **Illustration placeholder rule (F2).** Exercise illustration is P1 (FR-2.4). Until
  it ships, the card carries the exercise name and its equipment glyph; there is no
  grey image frame and no stock photograph. When it ships it is line art on
  `bg.raised`, square, never a photo, and never inside the set rows.

### 6.3 `SetRow`

- Anatomy: `SERIE n`, target reps, actual-reps stepper, optional effort chips,
  optional discomfort chip, confirm button.
- Two taps: confirm the rep count, done. Effort and discomfort are optional and
  never block confirmation.
- In readaptation, an unanswered effort still confirms the set; the session summary
  asks for it once per set before the block gate is evaluated
  (`training-science.md` §6). Nothing is filled in by the app.
- States: pending, active, confirmed (`success` mark + word), corrected, skipped.
- The effort chips are `fácil · correcto · duro · fallo`; discomfort is
  `molestia · dolor` only when the user opens the "más" affordance. Neither is
  required, and an unanswered set must look unanswered, not defaulted.

### 6.3b `SessionHistoryStrip`

- Last six sessions' top set for this exercise: bars, the most recent one in
  `accent`, direct labels on the first and last only, caption `serie top`.
- It exists to answer "why this weight" at the point of decision (FR-5.4, FR-11.5).
  It is not decoration and never replaces the previous-session line.

### 6.4 `LoadDecisionBar`

- Three equal actions: `Aceptar {{kg}}`, `Repetir {{kgPrevio}}`, `Otro peso`.
- The first two are one tap. `Otro peso` opens a numeric keypad with the suggested
  weight pre-filled.
- After a decision the bar collapses to the current weight with round `−` / `+`
  steppers (44 pt) and a `Cambiar` text button for the keypad: the weight remains
  changeable between sets (FR-5.7).

### 6.4b `SessionPager`

- Chevron (44 pt) · thin progress line · `2 / 6` · chevron. The line is the position,
  so the pager does not repeat the card's text.
- The count uses tabular digits; the label is announced as "Ejercicio 2 de 6".

### 6.5 `RestTimerBar`

- 60 pt bar above the home indicator: remaining time (monospaced, 22 pt), `+15 s`,
  `Saltar`, and a thin progress line.
- States: idle (hidden), running, extended, finished (brief `success` flash +
  haptic + sound), backgrounded (recomputed from `confirmedAt`).
- Visible while running even if the user pages to another exercise.

### 6.6 `PhaseBanner`

- Readaptation only: `Readaptación · semana 2 de 4` with a one-line explanation and
  a disclosure for the block criteria.
- Deliberately quiet: `bg.raised`, no accent fill. It informs, it does not alarm.

### 6.7 `MetricTile` and `ChartCard`

- `MetricTile`: label, value, unit, optional delta with an arrow **and** a word
  (`+1,5 kg`). One metric per tile.
- `ChartCard`: Swift Charts, direct labels on the last point, no gridlines beyond
  the axis, no gradient fills. Every chart states its metric and window
  (`Volumen semanal · últimas 12 semanas`).
- Estimated series are dashed and labelled `estimación` (FR-11.4).

### 6.8 `EmptyState`, `ErrorBanner`

- `EmptyState`: one sentence saying what is missing and the single action that
  fixes it. `Todavía no hay datos de Salud. Esto no impide entrenar.`
- `ErrorBanner`: inline, non-blocking, `danger` text on `bg.raised`, with `Reintentar`
  when retry is meaningful. Never an alert for a recoverable condition.

---

## 7. Screens

| Screen | Content | States that must exist |
| --- | --- | --- |
| Inicio | greeting, next workout, `Empezar entrenamiento`, last session, weekly summary | no history, session already done today, HealthKit empty |
| Entrenar | weekday template, session list, routine management entry | empty plan day, no sessions yet |
| Sesión | paged exercise cards, decision bar, rest bar, progress (`2 de 6`) | first time, resumed after crash, finished, partial |
| Resumen | duration, sets vs prescribed, volume, PRs, per-exercise read-out | no PR, partial session |
| Historial | session list → read-out | empty |
| Progreso | per-exercise strength chart, PRs, weekly volume, body weight | no data, single data point |
| Peso corporal | daily series, 7-day mean, goal, measurement list | fewer than 3 samples (gaps, no line) |
| Perfil | profile, goals, units, exercises, Apple Health, watch, data export | health unavailable, not requested |

Navigation: four tabs — `Inicio`, `Entrenar`, `Progreso`, `Perfil`. A session is
presented modally and must be resumable from `Inicio`, not buried under a tab.

---

## 8. Accessibility

- Every interactive element has a `label` and, where relevant, a `value` and `hint`:
  `"Peso sugerido, 102 coma 5 kilogramos"`, hint `"Ajusta con el incremento de 2 coma 5"`.
- The set row announces its state: `"Serie 2, completada, 6 de 6 repeticiones"`.
- VoiceOver order follows reading order; the paging container is exposed with the
  position as its value.
- Dynamic Type up to XXL without clipping (checked in F5).
- `Reduce Motion`, `Increase Contrast`, and `Differentiate Without Color` are honoured.
- No gesture-only action, no timed interaction that punishes hesitation.

---

## 9. Gym-usage checklist (the real acceptance test)

Every screen is judged against these, in this order:

1. Can it be used with one hand while holding a bar?
2. Is the primary action reachable by thumb without moving the phone?
3. Is the text legible at arm's length in dim light?
4. Does a wrong tap cause a harmless, undoable result?
5. Does a sweaty tap on a 44 pt target register first time?
6. Does anything require typing mid-set? (Answer must be no.)

---

## 10. Forbidden

From the brief §12, restated as review rules:

- Decorative gradients. (Accent fill on a primary button is not a decoration.)
- More than one accent hue.
- Cards inside cards; a card whose only content is a label.
- Charts without a decision the user can make from them.
- Duplicated information on one screen (e.g. the weight shown twice).
- Animations that delay an interaction.
- Reducing state to colour alone.
- Text entry during a session.

---

## 11. SwiftUI implementation notes

- Tokens live in `App/DesignSystem/Tokens.swift` as `Color`/`CGFloat` constants with
  semantic names; **no literal hex or magic number in a view**.
- Semantic colours are defined with `UIColor { traits in ... }` so dark/light swap
  without conditional branches in views.
- Components are `View` structs with a `preview matrix` (light/dark × default/XXL ×
  each state) so a missing state is visible during review.
- Charts are `Swift Charts`; no third-party chart library (ADR-006).
- Snapshot baselines for the paged card and the set row are produced in F5; they are
  the reference for later refactors.
- Icons are **SF Symbols**, not a custom font: `calendar`, `clock`, `heart`,
  `applewatch`, `square.and.arrow.up`, `figure.strengthtraining.traditional`,
  `chart.line.uptrend.xyaxis`, `plus`, `moon`, `chevron.left/right`. The artboards
  draw line equivalents at 20 pt / 1.8 stroke; the implementation uses the system
  symbol with the same role and label. An icon never carries meaning alone.
