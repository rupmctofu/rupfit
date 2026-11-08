# Design artboards

Static HTML/CSS/SVG mockups, not app code. They exist to be reviewed before any
SwiftUI is written (roadmap F2, gate G2). Tokens are copied from
`docs/design-system.md` §3–§6 and must change there first.

## F2 — MVP

- Canvas: `design/f2-mvp/index.html` — open it with `open design/f2-mvp/index.html`.
- 22 artboards at 393 × 852 (iPhone 15), 4 tabs, dark theme by default plus one
  light peer for the training screen.
- Deep links: `index.html?only=sesion-progress` renders a single artboard with no
  canvas chrome, which is what the screenshot tool loads.

Deliverables from the roadmap, and where they are:

| # | Deliverable | Artboards |
| --- | --- | --- |
| 1 | Training screen: card, decision bar, set row, rest bar | `sesion-decision`, `sesion-progress`, `sesion-resumed`, `sesion-error`, `sesion-light` |
| 2 | Session summary | `resumen`, `resumen-partial` |
| 3 | Home with and without history | `inicio-history`, `inicio-first` |
| 4 | Progress with one point and twelve weeks | `progreso-single`, `progreso-12w`, `progreso-empty` |
| 5 | Perfil → Apple Health explanation | `perfil-health`, `perfil-health-unavailable` |
| 6 | States: first time, resumed, HealthKit empty, error banner | `sesion-first`, `sesion-resumed`, `inicio-health-empty`, `sesion-error` |

Empty states of `design-system.md` §7, one per screen: `inicio-first` (no history),
`inicio-health-empty` (HealthKit empty), `entrenar-empty` (empty plan day),
`sesion-first` (first time), `resumen-partial` (no PR), `historial-empty`
(empty), `progreso-empty` and `progreso-single` (no data, one point), `peso-gaps`
(fewer than 3 samples), `perfil-health-unavailable` (health unavailable).

## Render a PNG

```bash
mkdir -p design/f2-mvp/renders
swift tools/screenshot.swift \
  "file://$PWD/design/f2-mvp/index.html?only=sesion-decision" \
  design/f2-mvp/renders/sesion-decision.png 393 852
```

`design/**/renders/` is ignored: the PNGs are build artifacts, the HTML is the
source. The WebKit renderer is used because Chromium headless does not start on
this Mac (`CVDisplayLinkCreateWithCGDisplay` fails).

## Decisions proposed in F2 (pending G2)

1. **Session position lives in the pager only.** `design-system.md` §6.2 lists
   `Ejercicio 2 de 6` inside the card and §2 shows it in the pager; duplicating it
   violates §10. The artboards keep it in the pager, which is always visible.
2. **Light-mode `success` and `warning`.** §3 defines them only for dark. Proposal:
   `#1A6B42` and `#7A5300`, both ≥ 4.5:1 on `#FFFFFF` and on `bg.raised`
   (`#EEF0F3`), which is where the chips sit.
3. **Perfil omits a global training-settings section.** Rest and timer are
   per-exercise in the data model, so the artboard points there instead of
   inventing a screen-level setting.
4. **Confidence is phrasing, not a badge.** No chip in the card; `engineVersion`
   §10 already says confidence changes phrasing and emphasis.

## Skin B (proposal, 2026-11-08)

The owner shared a Dribbble fitness UI and asked to borrow a little of its finish.
`index.html` has a **Skin A / Skin B** toggle (or `?skin=b`); the boards, copy and
decisions are identical, so the comparison is only visual.

| What changes | Skin A (current) | Skin B (proposal) |
| --- | --- | --- |
| Accent (dark) | `#F26B3A` | `#C6F24E`, label `#101200`, accent text `#D9FF7C` |
| Accent (light) | `#C24A16` | `#4E6A00`, label `#FFFFFF`, accent text `#405700` |
| Controls | 10 pt radius | pill (999) |
| Cards | 12 pt radius | 16 pt radius |
| Icons | now also present | same set |

In Skin B the estimated series uses `#B39DFF` instead of the default green: green is
too close to the lime accent to be told apart, and colour is never the only carrier.

Icons are in **both** skins: SVG line icons (20 pt, 1.8 stroke, currentColor) in the
pager, the phase banner, the rest timer, list rows and the primary action. They are
a proposal for §6 component anatomy; no icon carries meaning alone.

Contrast, measured with the same WCAG 2.1 formula as §3:

| Pair (Skin B) | Ratio | Requirement |
| --- | --- | --- |
| dark: accent / `bg.base` | 15.11:1 | 3.0 (UI) |
| dark: `onAccent` / accent | 14.62:1 | 4.5 |
| dark: accent text / `bg.base` | 17.28:1 | 4.5 |
| dark: success / `bg.raised` | 10.40:1 | 3.0 |
| light: accent / `bg.base` | 5.80:1 | 3.0 (UI) |
| light: `onAccent` / accent | 6.20:1 | 4.5 |
| light: accent text / `bg.base` | 7.60:1 | 4.5 |

If Skin B is approved: amend §3 (accent, onAccent, accentText, light success/warning),
§5 (`Radius.control` becomes pill for buttons, cards 16) and §6 (icon set and sizes),
then re-run the contrast table in §3. If only the icons are approved, Skin A stays and
§6 gains the icon rules.
