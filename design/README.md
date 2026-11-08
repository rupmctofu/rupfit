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

## Rendered captures

`design/f2-mvp/renders/` holds a PNG per artboard, named after its board id, so
the mockups can be reviewed on GitHub without opening the canvas. They are
committed on purpose; the HTML is still the source of truth, and regenerating
them replaces the files.

- `renders/<id>.png` — the 24 artboards in the current skin (B.2).
- `renders/skin-a/` — the same board ids for the three boards used to compare
  Skin A against Skin B (`sesion-decision`, `inicio-history`, `resumen`).

Boards not shipped as deliverables are rendered too, because they are evidence
for decisions: `entrenar`, `historial`, `perfil`, `sesion-photo` (adopted media
layout) and `inicio-photo` (rejected hero, kept as an experiment).

### Regenerate

```bash
for id in inicio-history sesion-decision resumen; do
  swift tools/screenshot.swift \
    "file://$PWD/design/f2-mvp/index.html?only=$id" \
    "design/f2-mvp/renders/$id.png" 393 852
done
```

Snapshots come out at 2× (786 × 1704), what the simulator produces for an
iPhone 15. The WebKit renderer is used because Chromium headless does not start
on this Mac (`CVDisplayLinkCreateWithCGDisplay` fails). Pass `&skin=a` for the
Skin A captures.

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

## Visual density (Skin B.1, 2026-11-08)

The owner asked for more icons and more visual finish. Added, all of it carrying
information rather than decoration:

- **Equipment and muscle chips** in the exercise card (`Barra`, `Cadena posterior`)
  from the exercise record, not invented.
- **Last six sessions** mini-bars inside the card: the data that justifies the
  suggested weight, at the point of decision.
- **Week strip** on Inicio: three strength days with `hecha` / `hoy` / pendiente,
  replacing a bare progress bar.
- **State words** instead of state chips in the routine list (`hecha`, `hoy`,
  `pendiente`), so a row never wraps a name to make room for a badge.
- **Icons in section labels** (calendar for phase and week, barbell for the last
  session) and per-row badges in Perfil, Historial and Resumen.

### Images

`inicio-photo` is an **experiment, not a deliverable**: it shows what a 150 pt hero
costs — the last session disappears from the first screen and `Empezar entrenamiento`
drops to mid-screen. `FR-2.4` puts exercise illustration in P1, and §1 rejects photos
as decoration, so adopting imagery needs a PRD change.

`design-system.md` §6.2 now carries the placeholder rule that FR-2.4 referenced but
did not exist: while illustration is missing, the card shows the exercise name and
its equipment glyph — no grey frame, no stock photo. When P1 illustration ships it is
line art on `bg.raised`, square, never inside the set rows.

## Skin B.2 — the owner's design system (2026-11-08)

The owner left `design/rupfit-design-system.md` and two mockups. Adopted:

- **Warm palette**: `#101214` background, `#171A1D` surface, `#22262A` raised,
  `#303438` border, `#F0F1EB` text, lime `#B8F34A`, and `accentMuted` `#26301B` for
  the recommended weight and today's cell. All pairs re-measured (see the table in
  `docs/design-system.md` §3).
- **One green**: success is the accent, per their rule; no second success hue.
- **Comparison tiles** (`Última vez` / `Peso de hoy`) instead of a bare previous-set
  line, the second one on `accentMuted` with a lime border.
- **Weight steppers**: round `−` / `+` on the collapsed decision, plus `Cambiar` for
  the keypad.
- **Session pager** as chevrons + thin progress line + `2 / 6`: one position
  indicator, not a bar plus a repeated label.
- **Body-weight tile** with a sparkline on Inicio (real data, no invented delta).

Not adopted, with the reason: exercise **photos** (FR-2.4 leaves illustration in P1
and a hero costs the last session), `Registrar` per set (we keep two taps:
confirm reps → done), the primary CTA inside the card (it stays full-width in the
thumb zone) and 52 pt buttons (we keep 56).

The two PNGs and the markdown are kept here as references, not as assets.

### Exercise media (adopted 2026-11-08)

`FR-2.4` was amended: media is optional per exercise, one licensed image of that
movement, above the text. `sesion-photo` is the reference board; `assets/sentadilla.jpg`
is a **crop of the owner's mockup**, used only to test the layout, not a production
asset. Without media the card keeps the equipment glyph. The Home hero
(`inicio-photo`) stays rejected: it costs the last session.
