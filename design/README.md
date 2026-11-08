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
