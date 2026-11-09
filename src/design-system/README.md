# `src/design-system` — tokens and components

The visual language of `docs/design-system.md` §4–§7 and §9, expressed once. Every
screen of the eight approved screens is built from these parts; no screen may
re-declare a colour, a radius, a font size or a duration.

Sources, in the order they win when they disagree:

1. `docs/design-system.md` §4 (colour and the measured contrast table), §5
   (typography), §6 (spacing, radius, motion, feedback), §7 (components), §9
   (accessibility).
2. `design/f2-mvp/index.html` — the approved artboard (`design-renders` branch).
3. `.worktrees/design-renders/design/f2-mvp/renders/*.png` — the 24 reviewed screens
   at 786 × 1704 (393 × 852 CSS px, iPhone 15 @2×), including `skin-a/`.
4. The provisional scaffold this replaces.

The artboard wins where it was **rendered and reviewed**; the document wins where it
states a **rule** the artboard only approximates (the 48 px target floor, the 12 px
text floor, contrast). Every such case is listed under
[Disagreements](#disagreements-and-how-they-were-resolved).

Files: `tokens.css`, `foundation.css`, `index.ts` (barrel), one `.tsx` plus one
stylesheet per component group. `main.tsx` keeps importing `tokens.css`; components
import `foundation.css` themselves, so no other wiring is needed.

---

## Tokens (`tokens.css`)

Two skins, both from the artboard: **skin B is the default** (`<html>` with no
attribute: lime accent, pill controls, 16 px cards — the artboard's own selection and
the owner's reference) and **skin A** is `<html data-skin="a">` (orange accent,
12 px cards, 10 px controls — the `skin-a/` renders). Dark is the default theme;
light is a peer, selected by `prefers-color-scheme` and overridden by
`:root[data-theme="dark"|"light"]`. `color-scheme` is declared per theme.

### Colour

| Token | Dark (skin B) | Light | Source |
| --- | --- | --- | --- |
| `--color-bg` | `#101214` | `#F7F7F9` | artboard `.theme-dark` / §4 light |
| `--color-surface` | `#171A1D` | `#FFFFFF` | artboard / §4 light |
| `--color-surface-raised` | `#22262A` | `#EEF0F3` | artboard / §4 light |
| `--color-border` | `#303438` | `#E3E5EA` | artboard / §4 light |
| `--color-text` | `#F0F1EB` | `#111315` | artboard / §4 light |
| `--color-muted` | `#92969D` | `#5A6270` | artboard / §4 light |
| `--color-subtle` | `#6F757C` | `#6E7787` | artboard / §4 light — **disabled and decorative only** |
| `--color-accent` | `#B8F34A` (A: `#F26B3A`) | `#4E6A00` (A: `#C24A16`) | artboard skin B / skin A |
| `--color-accent-ink` | `#101214` (A: `#12100E`) | `#FFFFFF` | artboard |
| `--color-accent-text` | `#B8F34A` (A: `#FF8A5C`) | `#405700` (A: `#B8430F`) | artboard |
| `--color-accent-muted` | `#26301B` (A: `#3A2318`) | `#EDF2DB` (A: `#F6E6DF`) | artboard |
| `--color-success` | `#B8F34A` (A: `#5BD98A`) | `#1A6B42` | artboard skin B / skin A |
| `--color-warning` | `#E8B85C` | `#7A5300` | artboard (light marked "proposal" there) |
| `--color-danger` | `#E47777` | `#B3261E` | artboard / §4 light |
| `--color-chart-1..4` | `#B8F34A` `#4C9AFF` `#B39DFF` `#C08CFF` | `#4E6A00` `#2F6FBF` `#2E8B57` `#7A4FBF` | artboard, plus §4's fourth hue (see D14) |
| `--color-focus-ring` | = `--color-accent-text` | = `--color-accent-text` | derived (§9 asks for a visible ring; the artboard draws none) |

### Contrast, measured today

Computed with the WCAG 2.1 relative-luminance formula from the **shipped** hexes
(the document's table was measured against its own, different, dark palette):

| Pair | Ratio | Requirement | Result |
| --- | --- | --- | --- |
| dark B: `text` / `bg` | 16.53:1 | 4.5 | pass |
| dark B: `text` / `surface` | 15.38:1 | 4.5 | pass |
| dark B: `muted` / `surface` | 5.88:1 | 4.5 | pass |
| dark B: `muted` / `raised` | 5.13:1 | 4.5 | pass |
| dark B: `subtle` / `surface` | 3.75:1 | 4.5 | **fails** — reserved for disabled and decorative glyphs (D6) |
| dark B: `accent-ink` / `accent` | 14.26:1 | 4.5 | pass |
| dark B: `accent-text` / `surface` | 13.28:1 | 4.5 | pass |
| dark B: `accent-text` / `accent-muted` | 10.49:1 | 4.5 | pass |
| dark A: `accent-ink` / `accent` | 6.27:1 | 4.5 | pass |
| dark A: `accent-text` / `bg` | 8.08:1 | 4.5 | pass |
| dark A: `accent-text` / `accent-muted` | 6.31:1 | 4.5 | pass |
| dark: `danger` / `surface` | 5.99:1 | 4.5 | pass |
| dark: `danger` / `raised` | 5.23:1 | 4.5 | pass |
| dark: `success` / `surface` | 13.28:1 (A 9.77:1) | 3.0 | pass |
| dark: `warning` / `raised` | 8.30:1 | 4.5 | pass |
| dark: series 2 / `surface` | 6.13:1 | 3.0 | pass |
| dark: series 3 / `surface` | 7.64:1 (A 9.22:1) | 3.0 | pass |
| dark: series 4 / `surface` | 7.02:1 | 3.0 | pass |
| light: `text` / `surface` | 18.62:1 | 4.5 | pass |
| light: `muted` / `surface` | 6.15:1 | 4.5 | pass |
| light: `subtle` / `surface` | 4.51:1 | 4.5 | pass |
| light: `accent-ink` / `accent` | 6.20:1 (A 4.90:1) | 4.5 | pass |
| light: `accent-text` / `surface` | 8.14:1 (A 5.46:1) | 4.5 | pass |
| light: `accent-text` / `accent-muted` | 7.10:1 (A 4.50:1) | 4.5 | pass |
| light: `danger` / `surface` | 6.54:1 | 4.5 | pass |
| light: `success` / `surface` | 6.51:1 | 3.0 | pass |
| light: `warning` / `surface` | 6.85:1 | 4.5 | pass |
| light: series 3 / `surface` | 4.25:1 | 3.0 | pass (non-text) |

Both skins keep every text pair at or above 4.5:1 except `--color-subtle`, which is
the disabled/decorative role. Skin B collapses `success` into the accent hue
("one green, no second success hue", artboard comment), so a completed set is
carried by the words `COMPLETADA`, `RÉCORD`, `duro` and by the check glyph — never by
colour alone (§4, §11).

### Typography

`html { font-size: 106.25% }` → `1rem` = 17 px, and it still grows with the iOS text
size and page zoom (§5.1). `-webkit-text-size-adjust` stays at `100%`.

| Token group | Value (rem) | px | Source |
| --- | --- | --- | --- |
| `--text-screen` / `--leading-screen` | `2` / `2.3529` | 34 / 40 | §5.1 |
| `--text-title-lg` / `--leading-title-lg` | `1.5294` / `1.8824` | 26 / 32 | artboard `.title.big` |
| `--text-title` / `--leading-title` | `1.2941` / `1.6471` | 22 / 28 | §5.1 |
| `--text-metric` / `--leading-metric` | `2.5882` / `2.8235` | 44 / 48 | §5.1 |
| `--text-metric-sm` / `--leading-metric-sm` | `1.6471` / `1.8824` | 28 / 32 | artboard `.metric.sm` |
| `--text-body` / `--leading-body` | `1` / `1.2941` | 17 / 22 | §5.1 |
| `--text-meta` / `--leading-meta` | `0.8824` / `1.1765` | 15 / 20 | §5.1 |
| `--text-label` / `--leading-label` | `0.7647` / `1.0588` | 13 / 18 | §5.1 |
| `--text-caption` / `--leading-caption` | `0.7059` / `0.9412` | 12 / 16 | §5.1 |
| `--leading-loose` | `1.2353` | 21 | artboard `.empty`, two-line reason |
| `--text-tab` / `--leading-tab` | `0.6471` / `0.8235` | 11 / 14 | artboard tab bar (the shell hard-codes 11 px today) |
| `--tracking-screen/-title-lg/-title/-metric/-metric-sm` | −0.6 / −0.4 / −0.2 / −1 / −0.4 px | | artboard |
| `--tracking-label` / `--tracking-caption` | 0.5 / 0.2 px | | §5.1 / artboard |
| `--weight-regular/-medium/-semibold` | 400 / 500 / 600 | | §5 (no 700) |
| `--font-sans` | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif` | | §5 |
| `--font-numeric` | `ui-rounded, -apple-system, 'SF Pro Rounded', system-ui, sans-serif` | | artboard `.metric` |

### Space, layout, radii, targets

| Token | Value | Source |
| --- | --- | --- |
| `--space-1..8` | 4, 8, 12, 16, 20, 24, 28, 32 px | §3 4 px grid; names kept from the shell |
| `--space-xxs..xxl` | aliases of the above | §6.1 naming |
| `--layout-screen-padding` / `-compact` | 20 px / 16 px (under 375 px) | §3 |
| `--layout-card-padding` / `-dense` / list padding | 20 px / 14 px / `4px 20px` | artboard `.card`, `.card.tight` |
| `--layout-stack-gap` / `-tight` | 10 px / 8 px | artboard `.screen {gap:10px}`, `.chips` |
| `--layout-hairline` | 1 px | §4 (no sub-pixel borders) |
| `--radius-card` | 16 px (A: 12 px) | artboard skin B / skin A |
| `--radius-sheet` | 16 px | §6.1 |
| `--radius-control` | 999 px (A: 10 px) | artboard skin B pills / skin A |
| `--radius-control-square` | 12 px (A: 10 px) | artboard `.stepper .b` |
| `--radius-badge` | 12 px (A: 9 px) | artboard `.ibadge` |
| `--radius-pill` / `--radius-track` / `--radius-track-thin` / `--radius-photo` | 999 / 4 / 2 / 16 px | artboard |
| `--target-min` | 48 px | §3, S4 |
| `--control-height` / `-compact` | 56 px / 44 px | §3, §7.1 |
| `--rest-bar-content-height` | 60 px | §7.5 |
| `--icon-size` / `-sm` / `--icon-stroke` | 20 / 14 / 1.8 | artboard icon set |
| `--bar-height` / `--progress-line-height` | 8 / 2 px | artboard `.bar`, `.rest .line` |

### Motion, safe areas, focus

| Token | Value | Source |
| --- | --- | --- |
| `--motion-fast` / `--motion-base` | 180 ms / 260 ms → **0 ms** under `prefers-reduced-motion` | §6.2 |
| `--motion-ease` | `cubic-bezier(.2, 0, 0, 1)` | §6.1 |
| `--safe-top/-bottom/-left/-right` | `env(safe-area-inset-*, 0px)` | §2.3 |
| `--safe-bottom-padding` | `max(8px, env(safe-area-inset-bottom))` | §2.3 — the inset grows *inside* a bar |
| `--focus-ring-width` / `-offset` | 2 px / 2 px | §9 (derived) |

`@media (prefers-contrast: more)` promotes `--color-muted` to `--color-text` and
strengthens `--color-border` to `--color-subtle` (§4). Nothing depends on
"Differentiate Without Color" or Smart Invert, which WebKit does not expose.

---

## Components

Every component is a pure function of its props: no fetching, no storage, no
`src/storage`, `src/features` or `src/app` import, no `useState`, no clock. A
component that needs behaviour gets a callback; when the callback is missing it
renders read-only instead of inventing an action. Controls are real `<button>`
elements, every one has an accessible name, and every interactive target is at least
`--target-min` (48 CSS px).

| Component | One line |
| --- | --- |
| `Icon` | The artboard's 24 × 24 line icons as inline SVG; `aria-hidden` unless given a `label`. |
| `PrimaryAction` | The single accent-filled action of a screen: 56 px, full width, `disabled` + `aria-disabled`. |
| `TextButton` | The quieter action (`Cambiar`, `Editar rutina`, `Añadir`) with a 48 px hit area from padding. Primary ink by default; `tone="danger"` for destructive rows and `tone="accent"` only where the word alone is not enough. |
| `Card` | Surface + hairline + radius; `padding="default" \| "dense" \| "list" \| "none"`; no shadow, never nested. |
| `SectionLabel` | The 13 px uppercase secondary label that introduces a block, with an optional leading glyph. |
| `Chip` | A word in a pill with a tone (neutral/selected/success/warning/danger/accent/solid); as a control it is a 48 px `aria-pressed` toggle whose pressed state is `selected` — tinted, never lime-filled, so a row of chosen options does not turn the screen into the accent. |
| `DataRow` | The list row: badge or weekday marker, title, subtitle, state word, value, chevron; a `<button>` with a sentence-long name when it navigates. |
| `Numeral` | Tabular figures at `metric` / `metric-small` / `inline` with a smaller unit; digits are never letter-spaced. |
| `MetricTile` | One metric: label, value + unit, optional delta word, one caption, optional trailing slot (a sparkline). |
| `DataStrip` | The Resumen row of two or three label/value cells with hairline separators, exposed as one named group. |
| `CompareTile` | `Última vez` / `Peso de hoy`; the `today` variant is the only accent-muted surface in the system. |
| `Stepper` | Reps and weight by increment: value between two 48 × 48 keys, no `<input type="number">`, value announced politely. |
| `SetRow` | `SERIE n` + target/achieved reps + optional effort and discomfort + one confirm target; five states, each with its own accessible name. |
| `LoadDecisionBar` | `Aceptar {{kg}}` / `Repetir {{kgPrevio}}` / `Otro peso`, three equal one-tap actions. |
| `WeightSummary` | The bar after a decision: the weight once, two 48 px keys to nudge it, the target line and `Cambiar`. |
| `WeightKeypad` | Our 4 × 3 pad of 48 px keys with a comma, a backspace and `Listo`; digits also work from a hardware keyboard. |
| `RestTimerBar` | 60 px rest bar derived from the caller's `confirmedAt`: remaining time, `+15 s`, `Saltar`, 2 px progress line, `DESCANSO TERMINADO` state. |
| `EmptyState` | What is missing in one sentence plus the one action that fixes it. `tone="quiet"` (a surface step, never the accent), `tone="primary"` (the screen's only accent fill, at most one per screen) and `bare` for a sentence without a box. No dashed border: that is wireframe language. |
| `Banner` | Inline, non-blocking notice with a tone, an optional action and an optional disclosure; the home of the three platform states. |
| `ErrorBanner` | `No se pudo guardar la serie 2…` + `Reintentar`; `role="status"`, never an alert or a modal. |
| `PhaseBanner` | `Readaptación · semana 2 de 4`, quiet, raised surface, no accent fill. |
| `Pager` | Two 48 px named chevrons, a progress line and `2 / 6`, exposed as `Ejercicio 2 de 6`. |
| `ChartFrame` | `<figure>` + visible caption (metric, window, endpoints) + legend + a visually hidden data table. |
| `LineChart` | Hand-written SVG polyline with an optional dashed comparison series, direct last-point label and thinned axis labels; `showLine={false}` draws measurements without inventing a trend. |
| `BarChart` | Weekly bars with the last bar highlighted and its value labelled. |
| `Sparkline` | The 110 × 44 trend inside a metric tile; decoration, `aria-hidden`. |

Not in this library on purpose: the paged `ExerciseCard` of §7.2 is **composed** by
the session screen from `Card`, `Chip`, `CompareTile`, `ChartFrame`, `SetRow` and
`Pager`, because the page container, the scroll-snap physics and the `scrollIntoView`
behaviour under `prefers-reduced-motion` belong to the screen that owns the state
machine (T4). Likewise no component formats a number: values arrive as strings with
the Spanish comma already in them.

Copy is Spanish and matches the artboard word for word where the artboard has a
word: `Descanso`, `+15 s`, `Saltar`, `DESCANSO TERMINADO`, `Aceptar`, `Repetir`,
`Otro peso`, `Listo`, `Confirmar`, `sin esfuerzo`, `fácil · correcto · duro · fallo`,
`molestia · dolor`, `RÉCORD`, `Peso de hoy`, `Cambiar`, `Reintentar`, `Hecho`.

---

## Disagreements, and how they were resolved

**D1 — Accent hue.** §4 fixes one accent hue, `#F26B3A`, with a measured table. The
artboard's default skin (also the owner's reference, and the one every render outside
`skin-a/` uses) is lime `#B8F34A`. → Skin B (lime) is the default and skin A (orange)
ships as `data-skin="a"`; both are in the artboard, so nothing is invented. §4's
contrast numbers describe skin A only, hence the measured table above.

**D2 — Dark neutrals.** §4 `#0B0C0E / #14161A / #1C1F25 / #2A2E36 / #F2F4F7 /
#A2A9B4 / #7C8899` vs artboard `#101214 / #171A1D / #22262A / #303438 / #F0F1EB /
#92969D / #6F757C`. → Artboard: these are the values in the reviewed renders.

**D3 — `warning`.** §4 `#F0C24B`, artboard `#E8B85C`. → Artboard.
**D4 — `danger`.** §4 `#FF7B72`, artboard `#E47777`. → Artboard.

**D5 — `success`.** §4 gives success its own green (`#5BD98A`). Skin B sets
`success` = accent lime ("their rule: one green, no second success hue"), so a
completed set or a record is one green, not two. → Artboard per skin; skin A keeps
`#5BD98A`. Colour-independence is preserved by the words and the check glyph.

**D6 — `text.tertiary` as small text.** The artboard draws 12 px captions and 9–10 px
axis labels in `#6F757C`: 3.75:1 on the card surface, below the 4.5:1 AA floor for
small text (§4's own table asks only 3.0 for tertiary, because it is the
disabled/timestamp role). → `--color-subtle` is reserved for disabled text and
decorative glyphs; the `caption` role ships in `--color-muted` (5.88:1). Captions
are therefore one step brighter than the artboard.

**D7 — Text below 12 px.** The artboard's chart axis labels are 9–10 px; §4 forbids
text below 12 px at the default size. → 12 px (`--text-caption`) for axis labels and
last-point values, with hierarchy taken from colour and weight instead of size.

**D8 — Radii.** §6.1 card 12 px / control 10 px; artboard skin B 16 px cards and
pill controls. → Artboard per skin (`16 / 999` in B, `12 / 10` in A).

**D9 — Stepper keys.** Artboard 44 × 44; §7.3 and S4 say 48 × 48. → 48.
**D10 — Rest bar buttons.** Artboard 36 px tall; §3 floor is 48. → 48 px targets
inside the 60 px content height.
**D11 — Effort chips.** Artboard 26 px pills used as toggles. → The pill keeps its
26 px look, the button around it is 48 px, so the row grows but the chips do not.
**D12 — Pager chevrons.** Artboard 44 px, §7.2 says 48 px. → 48.

**D13 — Set-confirmation feedback.** §6.3 asks for a `bg.raised` row surface plus a
`success` left border on confirm; the artboard shows neither, and instead changes
three other things at once (`10 / 10`, the effort chip with its word and dot, the
check glyph). → Artboard, because it still delivers §6.3's "three ways at once"
without turning every logged row into a filled block. No `bg.raised` row surface and
no left border ship.

**D14 — Chart series colours.** §4 lists four hues. Skin B replaces series 3 with
violet `#B39DFF` (the green would collide with the lime accent) and then sets series
4 to `#4C9AFF`, which duplicates series 2. → Series 3 is the artboard's violet, and
series 4 keeps §4's `#C08CFF` instead of shipping a duplicate token. No approved
screen draws four series; a four-series chart under skin B needs an owner decision.

**D15 — Light-theme `success` / `warning`.** §4's light table has neither; the
artboard supplies `#1A6B42` / `#7A5300` and labels them "proposal, pending review".
→ Shipped as the artboard's proposal and marked **provisional** here.

**D16 — Font weights.** §5 allows 400/500/600 and forbids 700 for body text; the
artboard uses 700 on the 12 px weekday check glyph. → No 700 token; the glyph is now
the `check` icon drawn with the icon stroke.

**D17 — Where tokens live.** §12 names `src/design-system/tokens.ts` as a typed
mirror "emitted as CSS custom properties". → One `tokens.css` is the single source.
A TypeScript mirror would duplicate every value, and a value that exists twice
drifts; components read `var(--…)` and never hold a literal.

**D18 — Unspecified scale steps.** `.title.big` (26/32) and `.metric.sm` (28/32) are
in the artboard but not in §5.1's scale, and the renders use them on several
screens. → Added as measured tokens (`--text-title-lg`, `--text-metric-sm`).

**D19 — Shell gutter.** §3 and the artboard use a 20 px screen gutter; the current
`src/app/shell.css` pads 16 px (`var(--space-4)`). → `--layout-screen-padding` is
20 px and documented; the shell is not this task's surface, so it still pads 16 px
and needs a one-line change when it is.

---

## Measured versus provisional

**Measured** (read from the artboard's CSS or the 786 × 1704 renders, or computed):
every colour; every type size, leading and tracking; every radius and padding; card,
control and rest-bar heights; icon size and stroke; the two skins; the contrast
table above.

**Provisional** (documented as uncertain, to be closed by an owner decision or a
device observation):

- light `success` / `warning` — the artboard itself marks them a proposal (D15);
- `--color-chart-4` in skin B — §4's hue, because the artboard duplicates series 2
  (D14);
- `--color-focus-ring` — derived from `--color-accent-text`; no focus ring is drawn
  anywhere in the artboard (§9 requires one);
- the `backspace` icon — the artboard has no keypad rendering, so this glyph is drawn
  to match the set;
- `--text-tab` — the shell still hard-codes 11 px, so the token is unexercised;
- `--safe-*` values are `env()` reads, not measurements: the concrete insets are
  device truth and are closed on the phone (§2.3, §12);
- `prefers-contrast: more` promotion follows §4's wording and cannot be verified on
  the development machine.
