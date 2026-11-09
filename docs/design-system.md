# Rupfit — Design System

Status: specified, not implemented. The design phase in `docs/roadmap.md` produces
an artboard for the training screen and must be reviewed by the owner before UI code
starts.

Target platform: **iOS Safari / WebKit** on the owner's iPhone 14 Pro (iOS 17/18),
installed from Safari to the Home Screen as a PWA (spec S2). Every visual rule below
is realised in HTML, CSS and TypeScript; the native components the previous version
of this document specified (SwiftUI views, system text styles, Swift Charts,
SwiftData, haptics) appear here only as the row in §2.2 that says what replaces them
and what is lost.

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

## 2. The rendering surface (WebKit, not UIKit)

This section is the reason the rest of the document is worded the way it is. A
native design assumes a platform that hands you text styles, haptics, charts and
system controls. WebKit hands us none of those, and each gap has a design
consequence rather than a note.

### 2.1 What the platform gives us

- **Standalone display.** Installed to the Home Screen, the app launches with no
  browser chrome: no URL bar, no back button, no pull-to-refresh, no tab strip, no
  share sheet in-app. The whole viewport belongs to us.
- **One rendering engine.** WebKit on iOS is the only engine that will ever run
  this app. Nobody tests Chromium or Android rendering, and nothing may depend on
  their behaviour: `navigator.wakeLock`, `dvh`, notification behaviour and keyboard
  behaviour all differ between engines, and only WebKit's answer counts.
- **CSS.** Layout, theming, scroll-snap paging and safe-area insets are ours to
  control precisely — better than native in some places (one layout that adapts to
  every width) and worse in others (the accessibility tree is ours to build by
  hand).
- **JavaScript with IndexedDB.** Durable state survives an app kill, but not a
  storage eviction (§2.5).

### 2.2 What WebKit does not give us (explicit list)

The authoritative constraint table is `docs/architecture.md` §2.2 (P-1…P-16).
This is the design-side reading of it: the same facts, expressed as what the
interface loses and what replaces it. If the two ever disagree, the architecture
table wins and this one is corrected.

| Native thing | Reality in the PWA | Design compensation |
| --- | --- | --- |
| Haptics (`.light`, `.success`, `.warning`) | **No Vibration API.** `navigator.vibrate` is not implemented in Safari on iOS and there is no other haptic channel (P-5). A web page cannot make the phone tap. | Every haptic is replaced by a persistent, read-at-arm's-length visual state plus an optional sound (§6.3) |
| System text styles / Dynamic Type as a free property | No SF text styles. `-apple-system` gives us SF Pro glyphs, not `largeTitle` semantics, and the iOS text-size setting does not scale arbitrarily sized text | Own `rem`-based scale that scales with the browser's text size and per-site zoom (§5) |
| Swift Charts | No chart library, and one is excluded by ADR-006 rather than merely unavailable | Charts are hand-drawn inline SVG with a text alternative (§7.7) |
| System controls (stepper, keypad, picker, switch) | We draw them. `<input type="number">` and the OS keyboard are unusable in a gym | Custom 48 px steppers and one designed keypad (§7.3, §7.4) |
| Background timers and background execution | Page timers are throttled and suspended when the app is backgrounded or the screen locks; the app cannot run while the user is in another app | The rest timer is **derived from `confirmedAt`**, never accumulated, and recomputed on `visibilitychange` (§6.4) |
| Screen stays on during a session | Screen Wake Lock exists (Safari 16.4+) but can be refused, dropped or unavailable | The design accepts a sleeping screen: every number is correct on return (§6.5) |
| Notifications without permission | Web Push requires an installed app, a permission grant and a push service; it cannot serve as an offline alarm | The rest timer never depends on a notification (§7.5) |
| Persistent storage (`navigator.storage.persist()`) | Not implemented in WebKit; iOS can evict the storage of a site it considers unused | Backup is a product feature, and eviction has its own UI state (FR-16.3, §7.8) |
| Background sync | Not available for this use case; the app has no network path at all (S3) | Everything writes to IndexedDB synchronously on confirmation (FR-6.5) |

Consequence that governs every component below: **feedback that a native app gets
from hardware must be delivered by the pixels we control.** Nothing may be a
transient flash or a buzz that we cannot produce.

### 2.3 Standalone viewport and safe areas

The viewport meta belongs to `docs/architecture.md` (P-12 owns the declaration).
The contract the design system depends on is: `width=device-width`,
`initial-scale=1`, `viewport-fit=cover`, and no scale restriction.

- `viewport-fit=cover` is mandatory: without it `env(safe-area-inset-*)` evaluates
  to `0` and every layout rule below silently does nothing.
- `user-scalable=no` and `maximum-scale=1` are **forbidden**. Pinch zoom stays
  available; the layout must survive 200 % zoom (§5.3).
- `apple-mobile-web-app-capable` (and the modern `display: standalone` in the
  manifest) produce the chrome-less launch. iOS supports `standalone` (and treats
  `fullscreen` as the same thing); `display_override` and `window-controls-overlay`
  are ignored (P-12: the status bar can be styled, never removed).
- The launch splash cannot be designed. iOS generates it from the icon and
  `background_color`; the only decision is that `background_color` equals
  `bg.base` so the transition into the first screen is invisible.

Insets and budget, on the iPhone 14 Pro in standalone (393 × 852 CSS px at device
pixel ratio 3):

| Region | Budget | Rule |
| --- | --- | --- |
| Top (dynamic island + status area) | `env(safe-area-inset-top)` ≈ 59 px | Nothing legible sits inside it. Screen titles are padded below it; scrolled content passes *under* it only behind an opaque surface. |
| Bottom (home indicator) | `env(safe-area-inset-bottom)` ≈ 34 px | The rest bar and the primary action sit **above** it. The bar's own height is content; its padding grows by the inset. |
| Sides (landscape, and the notch in landscape) | `env(safe-area-inset-left/right)` | Horizontal screen padding uses `max(20px, env(safe-area-inset-left))`. Landscape is not a supported training orientation but must not clip. |

```css
.barBottom {
  box-sizing: border-box;             /* the inset grows inside the bar */
  min-height: 60px;                   /* content height, unchanged */
  padding-bottom: max(8px, env(safe-area-inset-bottom));
}
```

There is no `constant()` fallback in the codebase: iOS 17+ supports `env()`.

### 2.4 Viewport units: the `100vh` problem

On iOS, `100vh` is the **large** viewport: it is measured as if the browser chrome
were hidden. In a Safari tab that makes an element sized with `100vh` taller than
what the user can see, so its bottom sits under the toolbar; and when the software
keyboard opens the visual viewport shrinks while `100vh` does not. In standalone
mode there is no collapsing URL bar, but the keyboard and the safe areas still
break it, so a single rule applies everywhere:

- **Never size a scroll container with `100vh`.**
- The app shell is sized with the dynamic viewport unit: `height: 100dvh`
  (iOS 16.4+, architecture P-13). There is no `100vh` in the stylesheet, not even
  as a fallback declaration, because a fallback that is wrong on the target device
  is worse than a missing property.
- If the first paint of a session jumps as the shell grows, the container is
  measured with `100svh` until the app reports itself ready.
- `html, body { height: 100%; overflow: hidden }` plus one `overflow-y: auto`
  region per screen. This keeps the header and the action bars fixed in the
  layout, keeps `env()` padding correct, and prevents the whole-document
  rubber-band scroll that iOS otherwise adds.
- `overscroll-behavior: contain` on the internal scroller: no scroll chaining, no
  accidental pull-to-refresh reload in a Safari tab (a reload is never a recovery
  path; see `docs/data-model.md` §7).
- Anything the keyboard is allowed to move is positioned against
  `window.visualViewport`, not against `100vh`. In practice the only such element
  is the designed keypad (§7.4).

### 2.5 Storage, eviction and what the design has to say about it

The app has no server (FR-16.1). Two consequences that are visible in the UI, not
just in the storage layer:

- **Eviction is a screen.** If IndexedDB is empty on launch where it previously
  held sessions, the app must not present a blank, cheerful first run. `Inicio` and
  `Perfil` show the eviction state: what was lost, what is still true, and the one
  action that fixes it — `Importar copia` (FR-16.3). The state is defined in §7.8.
- **Install status is a visible fact, stated once.** Running inside a Safari tab is
  a degraded mode: storage is far more likely to be cleared and the app is not the
  one on the Home Screen. `Perfil` states the current mode (`Instalada` / `En una
  pestaña de Safari`), read through the advisory `isInstalled()` probe of
  architecture §2.1.1, and shows the two install taps as copy — Safari exposes no
  programmatic install (P-11). The export affordance is emphasised while the app is
  not installed, and the advisory never becomes a modal, never repeats every launch
  and never blocks training (architecture §2.3).
- **The export has to leave the phone, and that is a design surface.** There is no
  way to write into a folder the user chooses (P-10). The export is offered as a
  download first, the share sheet second, the clipboard last, and which of the three
  works inside the installed app on this iOS version is uncertain. The UI therefore
  has to be honest about the result: it states what was produced and where it went,
  and it never shows a success state it cannot observe.

---

## 3. Layout

- Base grid: 4 CSS px. All spacing is a multiple of 4. (1 CSS px = 3 device px on
  the target device; "pt" is not a thing here and is not used in this document.)
- Screen padding: 20 px horizontal (16 px when the width is under 375 px).
- Card padding: 20 px.
- **Minimum touch target: 48 × 48 CSS px.** The Apple HIG minimum is 44; we ship
  48 as the floor and 8 px as the minimum gap between two adjacent targets,
  because chalk, sweat and cold hands cost accuracy and a miss mid-set is a real
  cost. Icon-only buttons are 48 × 48 even when the glyph is 20 px. Small text
  buttons keep a 48 px hit area via padding, never via a wrapper that shifts
  layout.
- Primary actions: 56 px tall, full width, `--radius-control` (10 px).
- Content is bottom-anchored where the action matters: the primary action sits in
  the thumb zone, not at the top.
- Safe areas respected; the rest timer bar is a bottom overlay above the home
  indicator, never under it (§2.3).
- Supported sizes: 375 × 667 through ~440 × 956 CSS px. Layout is a single column
  that breathes with width; no fixed pixel layouts. The reference device is
  393 × 852.
- Everything interactive sets `touch-action: manipulation` (removes the 300 ms
  double-tap delay and the accidental double-tap zoom on a fast tap sequence).
- `-webkit-touch-callout: none` and `user-select: none` on controls and numbers;
  the long-press text-selection bubble must never appear over a set row.
- Interaction styling is `:active`, never `:hover`. Hover-only affordances are
  forbidden (§11); hover styles, where they exist at all, live behind
  `@media (hover: hover)`.

```
┌───────────────────────────────┐
│  navigation title             │  17 px · secondary   (below the top inset)
├───────────────────────────────┤
│                               │
│  exercise card (paged)        │  fills available height (flex, not 100vh)
│  name · previous · suggested  │
│  sets · one-line reason       │
│                               │
├───────────────────────────────┤
│  [ ◀ ]  Ejercicio 2 de 6  [ ▶ ]│  48 px targets, always visible
├───────────────────────────────┤
│  ██ Aceptar 102,5 kg ███████  │  primary action, 56 px
├───────────────────────────────┤
│  Descanso 1:45  +15s  Saltar  │  rest bar, 60 px + safe-area padding
└───────────────────────────────┘
```

---

## 4. Colour

Dark is the default theme (gyms are dim; the screen is glanced at, not read). Light
is a full peer, not an afterthought. Only **one** accent hue exists.

### Dark

| Token | Hex | Use |
| --- | --- | --- |
| `bg.base` | `#0B0C0E` | App background |
| `bg.surface` | `#14161A` | Cards |
| `bg.raised` | `#1C1F25` | Sheets, timer bar, pressed states |
| `stroke.hairline` | `#2A2E36` | 1 px separators, card borders |
| `text.primary` | `#F2F4F7` | Headings, weights, numbers |
| `text.secondary` | `#A2A9B4` | Labels, reasons, metadata |
| `text.tertiary` | `#7C8899` | Disabled, timestamps |
| `accent` | `#F26B3A` | Primary action, selection, active state |
| `onAccent` | `#12100E` | Label on accent fill |
| `accentText` | `#FF8A5C` | Accent used as text on dark |
| `success` | `#5BD98A` | Set complete, PR |
| `warning` | `#F0C24B` | Recovery advisory, missing effort |
| `danger` | `#FF7B72` | Pain, destructive confirmation |

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
| `accent` | `#C24A16` | Primary action |
| `onAccent` | `#FFFFFF` | Label on accent fill |
| `accentText` | `#B8430F` | Accent as text |
| `danger` | `#B3261E` | Pain, destructive confirmation |

### Contrast, measured (not claimed)

Computed with the WCAG 2.1 relative-luminance formula on 2026-11-08:

| Pair | Ratio | Requirement | Result |
| --- | --- | --- | --- |
| dark: `text.primary` / `bg.base` | 17.76:1 | 4.5 | pass |
| dark: `text.secondary` / `bg.surface` | 7.65:1 | 4.5 | pass |
| dark: `text.tertiary` / `bg.surface` | 5.04:1 | 3.0 | pass |
| dark: `onAccent` / `accent` | 6.27:1 | 4.5 | pass |
| dark: `accentText` / `bg.base` | 8.43:1 | 4.5 | pass |
| dark: `danger` / `bg.surface` | 7.18:1 | 4.5 | pass |
| dark: `success` / `bg.surface` | 10.12:1 | 3.0 | pass |
| light: `text.primary` / `bg.surface` | 18.62:1 | 4.5 | pass |
| light: `text.secondary` / `bg.surface` | 6.15:1 | 4.5 | pass |
| light: `onAccent` / `accent` | 4.90:1 | 4.5 | pass |
| light: `danger` / `bg.surface` | 6.54:1 | 4.5 | pass |

**Colour is never the only carrier of meaning.** A PR is not "the green number"; it
carries the word `RÉCORD`. Pain is not a red row; it carries `dolor`.

Chart series (max 4, distinguishable for deuteranopia): `#F26B3A`, `#4C9AFF`,
`#6FD08C`, `#C08CFF` — always paired with a direct label, never a legend alone.

### WebKit specifics

- `color-scheme: dark light` is declared per theme so that native-drawn parts we do
  not control (scrollbars, the tap highlight, canvas defaults) match the theme
  instead of flashing white.
- `theme-color` follows `bg.base` and is declared once per scheme with
  `media="(prefers-color-scheme: dark|light)"`;
  `apple-mobile-web-app-status-bar-style` is `black-translucent` so the app draws
  under the status area and the top inset stays the only top padding.
- `-webkit-tap-highlight-color: transparent` on interactive surfaces; the press
  state is ours (§7.1). Otherwise iOS paints a grey rectangle over the accent fill
  at exactly the moment confirmation must look deliberate.
- **Badly lit gym.** The screen is read at 1.5 m with glare from overhead lighting
  and a possible screen protector. Therefore: no gradients (they read as smudges),
  no text below 12 px, no meaning carried by a 1 px line alone, and no large
  white-on-black flashes at rest-timer end — a bright full-bleed flash is painful
  at night and unreadable in daylight. The finished rest state is a colour change
  of the bar plus two words (§7.5).
- Hairlines are `1px` = 3 device px. Sub-pixel borders (`0.5px`) are forbidden:
  they round inconsistently across the snapping grid and produce dotted separators.
- `@media (prefers-contrast: more)` promotes `text.secondary` to `text.primary`
  and strengthens `stroke.hairline` to `text.tertiary`. This is the "Increase
  Contrast" setting the platform does expose to us.
- `prefers-color-scheme` is honoured by default; the in-app theme override writes
  the same tokens on `:root[data-theme]` so there is one source of truth.
- iOS has no media query for "Differentiate Without Color", and Smart Invert
  distorts any inverted palette. Nothing may depend on that setting existing.

---

## 5. Typography

No font file ships with the app (offline-first, NFR-1, NFR-8). The stack is
`-apple-system, system-ui, sans-serif`, which resolves to **SF Pro** on iOS. On the
Windows development machine it resolves to Segoe UI: that fallback is for
development only, and every typographic review happens on the phone.

Weights: 400, 500, 600. Never 700 for body text.

### 5.1 The scale

The root is set once so that `1rem` equals the 17 px body size, and every size in
the system is expressed in `rem`:

```css
html { font-size: 106.25%; }   /* 1rem = 17px at the default text size */
```

106.25 % is a base, not a lock: it makes `1rem` equal 17 px against the browser's
default 16 px, and it still grows when the user enlarges the default text size,
which is the whole point of expressing the scale this way.

| Role | Size / leading | rem | Notes |
| --- | --- | --- | --- |
| Screen title | 34 / 40 | `2rem` | One per screen |
| Card title (exercise name) | 22 / 28 | `1.3rem` | Wraps, never shrinks to illegible |
| Metric (weight, timer) | 44 / 48 | `2.6rem` | Tabular figures, no locale guessing |
| Section label | 13 / 18 | `0.76rem` | Uppercase, `text.secondary`, tracking 0.5 px |
| Body | 17 / 22 | `1rem` | Reasons, descriptions |
| Meta | 15 / 20 | `0.88rem` | "Sesión anterior · 100 kg × 6" |
| Caption | 12 / 16 | `0.71rem` | Provenance, timestamps |

The sizes are deliberately the SF text-style sizes (34 / 22 / 17 / 15 / 13 / 12) so
that the app looks native without pretending to be native: the numbers are the same,
the scaling mechanism is ours.

### 5.2 Numbers

`font-variant-numeric: tabular-nums` on every weight, rep count and timer. This is
the replacement for the native monospaced-digit behaviour: a change from 100 to
102,5 must not move the layout by a pixel. Digits are never letter-spaced, and
decimal separators come from the locale (comma in Spanish), rendered as text, not
as a formatted number we re-parse.

### 5.3 Surviving iOS text sizing

- `-webkit-text-size-adjust` is left at `100%`. Setting it to `none` is forbidden:
  it is the one thing that guarantees a user who enlarges text gets nothing.
- Because the scale is in `rem` and the root is a percentage, the iOS text-size
  setting and Safari's per-site page zoom both scale the whole system. The layout
  is checked at the default size, at the largest text size the owner can set, and
  at 200 % page zoom.
- Rules that keep it from breaking:
  - No fixed heights on anything containing text. Cards use `min-height`, and the
    shell uses `flex: 1` with an internal scroller.
  - No `text-overflow: ellipsis` on the one-line reason, the previous-session line
    or the phase explanation. Those must be readable; they wrap.
  - `overflow-wrap: anywhere` on exercise names (user-created names can be one long
    token).
  - `white-space: nowrap` only on values that cannot wrap (a timer, a weight) —
    never on a label next to one.
  - No font below 12 px at the default text size, ever.
- Worst case (largest text size, 200 % zoom, landscape) is a design review item:
  the primary action stays reachable and nothing clips. It is acceptable for the
  card to become a very tall column that scrolls; it is not acceptable for an
  action to be pushed outside the viewport.

---

## 6. Spacing, radius, elevation, motion, feedback

### 6.1 Tokens

Tokens are defined once and emitted as CSS custom properties; no literal value
appears in a component (§12).

```css
:root {
  --space-xxs: 4px; --space-xs: 8px;  --space-s: 12px;  --space-m: 16px;
  --space-l: 20px;   --space-xl: 24px; --space-xxl: 32px;

  --radius-card: 12px; --radius-sheet: 16px; --radius-control: 10px;

  --duration-state: 180ms; --duration-page: 260ms;
  --ease-state: cubic-bezier(.2, 0, 0, 1);
}
```

### 6.2 Elevation and motion

- Elevation: none except sheets and the rest bar, which use `bg.raised` plus a
  1 px top hairline. No box shadows in the content area.
- Motion: 180 ms ease-out for state changes, 260 ms for card paging.
  **Confirming a set is instant** — no animation may delay the confirmation, and
  the row's new state must be committed to the DOM in the same task as the write to
  IndexedDB.
- `@media (prefers-reduced-motion: reduce)`: paging animation and all transitions
  are removed. Card paging becomes an instant scroll (`behavior: auto`), state
  changes cross-fade, and `scroll-behavior: smooth` is never set globally.
- Animation is never the only signal for a completed action (§6.3).

### 6.3 Feedback without haptics

There is no haptic feedback on iOS WebKit (§2.2). The native plan used `.light` on
set confirm, `.success` on a PR and `.warning` at rest end; all three are replaced
by design, not by hope:

| Moment | Replacement |
| --- | --- |
| Set confirmed | The row changes in three ways at once: the word `COMPLETADA`, a check glyph, and the row surface moving to `bg.raised` with a `success` left border. The rest bar appears in the same frame. No dependence on a flash. |
| Personal record | `RÉCORD` as a word in the summary line of the set, in `success`, plus the same row treatment. Record detection is never a sound-only event. |
| Rest ended | The bar holds a persistent state (§7.5): colour change, the words `DESCANSO TERMINADO`, and the elapsed time since it ended. It stays until the next set starts or the user dismisses it. |
| Anything destructive | Requires a confirmed press-and-hold or a two-step confirmation with the consequence written out; never a bar vibration to signal danger. |

Sound is **additive and optional**: a short tone at rest end, played through Web
Audio only after the audio context has been unlocked by a tap in the session
(iOS starts every audio context suspended, and the ringer switch mutes it
regardless). The app therefore assumes silence. Sound is never required to know
that rest ended, and no requirement may depend on it (FR-8.2).

### 6.4 The rest timer is derived, not accumulated

Page timers are throttled in the background and stopped when the screen locks. The
timer therefore renders `now - confirmedAt` (with extensions as stored offsets) and
recomputes on `visibilitychange`, on `focus`, and on `pageshow` (including a
back-forward restore). It never counts up with `setInterval`. When the app returns
after the end time, it shows the state as finished with `hace 1:12` rather than
pretending the countdown is still live.

### 6.5 Screen wake lock

`navigator.wakeLock.request('screen')` is documented as available from Safari 16.4,
but whether it is usable inside an installed web app on this device is uncertain
(architecture P-14) and is one of the things measured on the phone. It is
requested when a session starts and released when the session ends. It is treated as
an enhancement, in this order:

1. Requested inside the `Empezar entrenamiento` / `Continuar` tap, so it is
   gesture-initiated.
2. Re-acquired on `visibilitychange` back to visible, because the platform releases
   the lock when the page is hidden.
3. If the API is missing, the request rejects, or the lock is dropped (low power
   mode, thermal state, the user leaving the app), nothing else changes and nothing
   is announced: the timer is timestamp-derived (§6.4), the set rows are already
   persisted, and the only cost is that the screen may sleep and the user has to
   wake it.
4. The wake lock is never presented as a guarantee. No requirement, no acceptance
   criterion and no copy depends on the screen staying lit.

Whether the lock actually holds in standalone mode on the owner's device is an open
verification item for the UI phase; until it is observed on the phone, it is
documented as "may be unavailable".

---

## 7. Components

Each component lists anatomy and the states that must exist. A component without an
empty, error and loading decision is not finished. Everything below is a DOM
component; no native control is used.

### 7.1 `PrimaryAction`

- 56 px tall, full width, `accent` fill, `onAccent` label, `--radius-control`.
- A real `<button>`. States: enabled, pressed (`:active`, opacity 0.85, no
  `-webkit-tap-highlight-color` overlay), disabled (`text.tertiary` on `bg.raised`,
  `disabled` attribute + `aria-disabled`), loading (never used: no action here
  waits on the network).
- One per screen. If two actions compete, one becomes a text button.

### 7.2 `ExerciseCard`

- Anatomy: session position (`Ejercicio 2 de 6`), name, previous session line,
  suggested load block, one-line reason, set rows, and a secondary
  `Cambiar el peso` text button.
- States: first-time (no history, "elige un peso"), insufficient data, suggested,
  user-overridden, completed, skipped.
- No illustration and no placeholder box: an exercise without an image shows its
  name, its muscle group and its equipment, and nothing pretends an image is
  loading (FR-2.4). Illustration is `P1`, and the card is finished without it.
- Paging: a horizontal scroll container with `scroll-snap-type: x mandatory` and
  `scroll-snap-align: center` per card. This uses the platform's own scrolling
  physics instead of a scripted transition, so there is no paging animation of ours
  to disable under reduced motion. Pinned chevrons (48 px) scroll by one card with
  `scrollIntoView({ behavior, inline: 'center' })`, where `behavior` is `auto` under
  reduced motion. Swipe is a shortcut, never the only route (FR-6.2).
- `overscroll-behavior-x: contain` so a swipe on the first or last card cannot
  trigger Safari's swipe-back navigation. Losing a session to an accidental
  back-swipe is exactly the failure this rule exists to prevent.

### 7.3 `SetRow`

- Anatomy: `SERIE n`, target reps, actual-reps stepper, optional effort chips,
  optional discomfort chip, confirm button.
- Two taps: confirm the rep count, done. Effort and discomfort are optional and
  never block confirmation.
- The stepper is two 48 × 48 buttons with the value between them. `<input
  type="number">` is forbidden: it exposes platform spinners we cannot size, it
  accepts stray changes, and tapping it opens the OS keyboard over the session.
  Reps are incremented, never typed.
- States: pending, active, confirmed (`success` mark + word), corrected, skipped.
- The effort chips are `fácil · correcto · duro · fallo`; discomfort is
  `molestia · dolor` only when the user opens the "más" affordance. Chips are
  toggle buttons with `aria-pressed`. Neither is required, and an unanswered set
  must look unanswered, not defaulted.

### 7.4 `LoadDecisionBar`

- Three equal actions: `Aceptar {{kg}}`, `Repetir {{kgPrevio}}`, `Otro peso`.
- The first two are one tap. `Otro peso` opens **our** numeric keypad — a 4 × 3 grid
  of 48 px keys with the suggested weight pre-filled, a comma key, and `Listo`. It
  is not a text field: no OS keyboard, no cursor, no autocorrect, no dictation
  popover, and therefore no violation of FR-6.8. If the keypad is open and the
  visual viewport changes (rotation, a hardware keyboard appearing), it is
  repositioned from `window.visualViewport`, never from `100vh` (§2.4).
- After a decision the bar collapses to a one-line summary with an edit affordance:
  the weight remains changeable between sets (FR-5.7).

### 7.5 `RestTimerBar`

- 60 px content height above the home indicator (plus safe-area padding, §2.3):
  remaining time (tabular, 22 px), `+15 s`, `Saltar`, and a 2 px progress line.
- States: idle (hidden), running, extended, finished, backgrounded/returned
  (recomputed from `confirmedAt`, possibly already finished).
- Finished state, as designed for the absence of haptics: the bar keeps its height,
  the progress line completes, the surface turns `success`-tinted, and the text
  reads `DESCANSO TERMINADO` with `hace 1:12` under it. It persists until the next
  set starts or the user dismisses it. There is no flash-only signal, and no
  dependence on sound or a notification (FR-8.2).
- Visible while running even if the user pages to another exercise.
- Accessibility: the remaining time is not a live region. Announcing every second
  would make VoiceOver unusable. The bar has a static label
  (`Descanso, quedan 1 minuto 45 segundos`) updated on demand, and one polite
  announcement when the rest ends.

### 7.6 `PhaseBanner`

- Readaptation only: `Readaptación · semana 2 de 4` with a one-line explanation and
  a disclosure for the block criteria.
- Deliberately quiet: `bg.raised`, no accent fill. It informs, it does not alarm.

### 7.7 `MetricTile` and `ChartCard`

- `MetricTile`: label, value, unit, optional delta with an arrow **and** a word
  (`+1,5 kg`). One metric per tile.
- `ChartCard`: a hand-drawn inline SVG chart, with no charting library (ADR-006).
  Direct labels on the last point, no gridlines beyond the axis, no gradient fills.
  Every chart states its metric and window
  (`Volumen semanal · últimas 12 semanas`).
- Estimated series are dashed and labelled `estimación` (FR-11.4).
- An SVG is opaque to VoiceOver, so every `ChartCard` carries a text alternative in
  the DOM: a `<figcaption>` with the metric, the window and the two endpoints, plus
  a visually hidden data table for the series. The chart is never the only carrier
  of the number.
- Charts are static images of data, not animated on entry: an animation on a
  progress screen is decoration (FR-11.5, §11).

### 7.8 `EmptyState`, `ErrorBanner`, and the platform states

- `EmptyState`: one sentence saying what is missing and the single action that
  fixes it. Drawn as a surface step, never as a dashed rectangle — a dashed outline
  reads as a wireframe, and this is the most seen element of a fresh install. Three
  shapes: `quiet` (default, never spends the accent), `primary` (the screen's only
  accent fill, at most one per screen, for the screens whose only action this is)
  and `bare` (the sentence without the box, for the places where a box would nest
  inside a card).
- `ErrorBanner`: inline, non-blocking, `danger` text on `bg.raised`, with
  `Reintentar` when retry is meaningful. Never an alert, never `window.alert`,
  never a modal for a recoverable condition.
- The health-data empty state changes with the platform: there is no Health
  source to be empty, so the state is `Todavía no hay datos de salud importados.
  Esto no impide entrenar.` and it is informational, never blocking (S4, FR-13).
- Three platform states, all inline. The evicted state is the only one that is not
  dismissible, because the condition it reports is a real loss rather than advice:
  - **Evicted** (`danger`): `Los datos guardados ya no están. Importa tu copia si
    la tienes.` with `Importar copia` as the action and the date of the last
    successful export if one is known.
  - **Not installed** (`warning`, advisory): `Guarda Rupfit en la pantalla de inicio
    para que Safari no borre tus datos.` with `Compartir → Añadir a pantalla de
    inicio` as copy and `Exportar copia`. It lives in `Perfil`, plus at most one
    inline notice on `Inicio` once real data exists. There is no API to trigger the
    install sheet on iOS, so text is the whole affordance (P-11).
  - **Update available** (`warning`, advisory): `Hay una versión nueva. Se aplicará
    al terminar la sesión.` with `Actualizar ahora` disabled while a session is
    running and enabled otherwise (ADR-012). The component exists so that the
    update prompt of `src/pwa/update.ts` has a designed home instead of a browser
    dialog.

---

## 8. Screens

| Screen | Content | States that must exist |
| --- | --- | --- |
| Inicio | greeting, next workout, `Empezar entrenamiento`, last session, weekly summary | no history, session already done today, no imported health data, storage evicted |
| Entrenar | weekday template, session list, routine management entry | empty plan day, no sessions yet |
| Sesión | paged exercise cards, decision bar, rest bar, progress (`2 de 6`) | first time, resumed after the app was killed or the page was discarded from memory, resumed after the screen slept, finished, partial |
| Resumen | duration, sets vs prescribed, volume, PRs, per-exercise read-out | no PR, partial session |
| Historial | session list → read-out | empty |
| Progreso | per-exercise strength chart, PRs, weekly volume, body weight | no data, single data point |
| Peso corporal | daily series, 7-day mean, goal, measurement list | fewer than 3 samples (gaps, no line) |
| Perfil | profile, goals, units, exercises, storage and backup (export/import), install status, update status, training settings | storage evicted, export in progress, export result unknown, import invalid, not installed, update available, no imported health data (not applicable, explained) |

Navigation: four tabs — `Inicio`, `Entrenar`, `Progreso`, `Perfil`. A session is
presented as a full-height sheet over the tab bar and must be resumable from
`Inicio`, not buried under a tab. There is no browser back button in standalone
mode, so back navigation is always an on-screen control, and the active route is
kept in the URL so that a relaunch after the page was discarded returns to the same
screen (the routing form belongs to `src/app/routes.tsx`).

---

## 9. Accessibility

- Every interactive element has an accessible name and, where relevant, a value and
  a hint: `aria-label="Peso sugerido, 102 coma 5 kilogramos"`, plus a hint carried by
  `aria-describedby` pointing at a visually hidden text node
  (`Ajusta con el incremento de 2 coma 5`) rather than `aria-description`, whose WebKit
  support is not something this project can rely on.
- The set row announces its state: `"Serie 2, completada, 6 de 6 repeticiones"`.
- VoiceOver order follows reading order; the paging container is exposed as a group
  (`role="group"`) whose accessible name carries the position
  (`Ejercicio 2 de 6`), and the chevrons have names, not glyphs.
- Controls are real `<button>` elements. A `div` with a click handler and a role is
  not acceptable: it loses keyboard support, focus and the activation semantics
  VoiceOver relies on.
- Text size: the iOS text-size setting and page zoom up to 200 % without clipping,
  checked at the three sizes of §5.3.
- `prefers-reduced-motion: reduce`, `prefers-contrast: more` and the in-app theme
  override are honoured. Where WebKit exposes no setting (Differentiate Without
  Color, Smart Invert) the design is already colour-independent, so nothing is
  claimed about that setting.
- Focus is visible (`:focus-visible`) for a hardware keyboard; the roving focus
  inside a scroll-snapping pager must not scroll the layout unpredictably.
- No gesture-only action, no hover-only action, no long-press-only action, no timed
  interaction that punishes hesitation.

---

## 10. Gym-usage checklist (the real acceptance test)

Every screen is judged against these, in this order:

1. Can it be used with one hand while holding a bar?
2. Is the primary action reachable by thumb without moving the phone?
3. Is the text legible at arm's length in dim light, on a screen with glare?
4. Does a wrong tap cause a harmless, undoable result?
5. Does a sweaty or chalky tap on a 48 px target register first time?
6. Does anything require typing mid-set? (Answer must be no.)
7. Does it survive the screen sleeping or the user switching apps mid-rest?
8. After a reload, does the screen show the same state it showed before it?

---

## 11. Forbidden

From the brief §12, restated as review rules, plus the platform rules this pivot
adds:

- Decorative gradients. (Accent fill on a primary button is not a decoration.)
- More than one accent hue.
- Cards inside cards; a card whose only content is a label.
- Charts without a decision the user can make from them.
- Duplicated information on one screen (e.g. the weight shown twice).
- Animations that delay an interaction; animation as the only confirmation.
- Reducing state to colour alone.
- Text entry during a session; the OS keyboard during a session.
- Hover-only states, gesture-only navigation, long-press-only actions.
- Disabling pinch zoom (`user-scalable=no`, `maximum-scale=1`) or text inflation
  (`-webkit-text-size-adjust: none`).
- Sizing a scroll container with `100vh`; a `position: fixed` bottom bar that
  ignores `env(safe-area-inset-bottom)`.
- Any dependence on `navigator.vibrate`, on a notification permission, or on the
  screen staying awake.
- Web fonts, a CSS framework (Tailwind or any other), a charting library, a state
  library, a meta-framework or an analytics/error-reporting SDK (ADR-006,
  architecture §3.1, §3.3). `react` and `react-dom` are the allowed UI runtime and
  are not a licence to add a component library on top.
- `window.alert`, `confirm` and `prompt` as interaction.

---

## 12. Implementation notes

- Tokens live in `src/design-system/tokens.ts` (the layout of
  `docs/architecture.md` §5) as typed semantic names, emitted as CSS custom
  properties so stylesheet rules and components read the same values; **no literal
  hex or magic number in a component**. Dark and light are the same token names with
  different values, selected by `prefers-color-scheme` and overridden by
  `:root[data-theme="dark|light"]`, so no component branches on the theme.
- Components are React function components in `src/design-system/components/`:
  props in, elements out, no state of their own, no import from
  `src/features`, `src/storage` or the engine (the boundary rule of architecture §4
  is executable and checked in CI). A component that needs behaviour receives it
  from its caller.
- Every component ships into the **preview matrix**: a static page that renders it
  in light and dark, at the default text size and at the largest review size, in
  every state listed in §7, and which is published on the phone as part of the
  preview build. A state that does not appear in the matrix is treated as missing
  during review — this replaces the native preview matrix, which depended on a
  toolchain this project no longer has.
- Screenshot baselines of the paged card and the set row are captured on the phone
  in the UI phase and are the reference for later refactors. Baselines come from the
  device, not from a desktop browser: text metrics and safe areas differ.
- Charts are inline SVG generated from data, with no third-party library (ADR-006),
  and always paired with the text alternative of §7.7.
- Anything in this document that depends on unverified device behaviour — the wake
  lock holding in standalone mode, the exact safe-area values on the owner's device,
  the behaviour of the visual viewport while the keypad is open, which export route
  actually works — is uncertain by design (architecture §2.2) and is closed by an
  observation recorded in `docs/environment.md`, not by an assumption.
