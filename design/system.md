# Rupfit design system

A source-grounded snapshot of the shipped UI system after adopting the owner's light-lavender/violet reference. Source palette values are read from `src/design-system/tokens.css`; they are not pixel-sampled claims. Theme selection, skin comparison and default mode follow that file. Use app tokens as the implementation source of truth.

## Sources

- `src/design-system/tokens.css` — colors, typography, spacing, radii, targets, motion, safe areas, focus.
- `src/design-system/foundation.css` — text roles, 17 px root, control reset, focus, visually hidden content.
- `src/design-system/README.md` — component contracts and accessibility invariants.
- `src/design-system/components/actions.css`, `cards.css`, `chips.css`, `charts.css`, `metrics.css` — representative component geometry and states.

## Color

### Light default

| Token | Value | Role |
|---|---:|---|
| `--color-bg` | `#F5F3FF` | Lavender page canvas |
| `--color-surface` | `#FFFFFF` | Cards and working surfaces |
| `--color-surface-raised` | `#F0EDFA` | Quiet raised surfaces, neutral chart bars |
| `--color-border` | `#E2DEF0` | Hairlines and card edges |
| `--color-text` | `#17142A` | Primary text |
| `--color-muted` | `#67637D` | Secondary text |
| `--color-subtle` | `#77738A` | Disabled/decorative text only |
| `--color-accent` | `#5734E6` | The single primary action, active navigation, selected data point |
| `--color-accent-ink` | `#FFFFFF` | Text on filled violet |
| `--color-accent-text` | `#4F2DD1` | Violet text/icon on light surfaces |
| `--color-accent-muted` | `#EEE9FF` | Tinted selected/compared surface |
| `--color-success` | `#15805E` | Completed/positive state, distinct from violet |
| `--color-warning` | `#8A5600` | Advisory state |
| `--color-danger` | `#B4233D` | Destructive/error state |

### Dark peer (`prefers-color-scheme: dark` or `data-theme="dark"`)

Canvas `#12111B`, surface `#1B1A27`, raised `#26243A`, border `#3B394F`, text `#F6F3FF`, muted `#B4B0C9`, subtle `#858098`, accent `#A892FF`, accent ink `#171329`, accent text `#BBAAFF`, accent-muted `#30294D`, success `#64D6AA`, warning `#F0C06A`, danger `#FF8994`. Chart series: `#B39BFF`, `#69B6FF`, `#67D2A8`, `#F0A875`.

### Chart colors (light)

`--color-chart-1..4`: `#5734E6`, `#8D77EE`, `#4375C8`, `#15805E`. Pair every series with a direct label; reserve violet for the series/data point the person needs to notice.

### Contrast spot-check (WCAG relative luminance)

| Pair | Ratio |
|---|---:|
| Light primary text / canvas | 16.37:1 |
| Light muted text / white | 5.74:1 |
| Light subtle text / white | 4.56:1 |
| White button label / violet action | 6.91:1 |
| Violet action text / white | 7.99:1 |
| Green success text / white | 4.91:1 |
| Dark primary text / canvas | 17.10:1 |

The `subtle` role is reserved for disabled or decorative use; contrast alone does not establish full accessibility.

## Typography

`html` root is `106.25%`, so `1rem = 17 px` and user text scaling remains enabled. Font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`; numeric stack: `ui-rounded, -apple-system, 'SF Pro Rounded', system-ui, sans-serif`.

| Role | Size / line-height | Weight |
|---|---:|---:|
| Screen title | 34 / 40 px | 600 |
| Large card title | 26 / 32 px | 600 |
| Card title | 22 / 28 px | 600 |
| Metric | 44 / 48 px | 600 |
| Small metric | 28 / 32 px | 600 |
| Body | 17 / 22 px | 400 |
| Meta | 15 / 20 px | 400 |
| Label | 13 / 18 px | 500 |
| Caption | 12 / 16 px | 400 |
| Tab | 11 / 14 px | 500 |

No font weight above 600. Keep numeric columns tabular and units visually subordinate.

## Layout, shape and motion

- 4 px base grid: `--space-1..8` = 4, 8, 12, 16, 20, 24, 28, 32 px.
- Screen gutter 20 px (16 px below 375 px); default card padding 20 px; dense card padding 14 px; hairline 1 px.
- Card radius 16 px; sheet radius 16 px; controls are pills (`999 px`) or square controls (`12 px`); track radius 4 px / thin track 2 px.
- Touch target 48 px minimum; primary action 56 px; compact control 44 px; rest bar content 60 px.
- Motion: 180 ms fast, 260 ms base, `cubic-bezier(.2, 0, 0, 1)`; reduce nonessential motion to 0 ms when requested.
- Safe-area tokens: `--safe-top/-bottom/-left/-right`; bottom inset belongs inside persistent controls.

## Component rules

| Component | Rule |
|---|---|
| `PrimaryAction` | One filled violet action per screen; 56 px minimum height, grows with label. |
| `TextButton` | Secondary action in primary text ink; danger tone for destructive actions. |
| `Card` | White/light surface + 1 px border + 16 px radius; no shadow; avoid nesting. |
| `Chip` | Labels the state; selected options use a lavender tint, not a filled accent pill. |
| `DataRow` | Full-width semantic row; title, subtitle, meaningful status/value, chevron as applicable. |
| `Stepper` / `WeightEntry` | 48 px targets; exact discrete values, no imprecise slider for load. |
| `SetRow` / `RestTimerBar` | Weight and reps stay visible together; rest is tied to the confirmed set. |
| `ChartFrame` / `LineChart` / `BarChart` | Actual data only, visible time window/labels, accessible summary/table; no invented empty trend. |
| `EmptyState` | One sentence and one useful action; no dashed wireframe border. |
| Icons | Existing 24×24 inline SVG set, 1.8 px stroke; do not substitute emoji/Unicode. |

## Product-data guardrails for charts

A screen may show recorded session counts, personal records, recommended loads, exercise history, prescribed sets/rest, and bodyweight measurements already available in Rupfit. Weekly set progress is expressed as `x de y series`, never as a bare percentage. Session durations may be summed from known records. Workout calories and an XP/level/rank do not exist and must not be displayed or estimated. Missing values remain explicitly missing; gaps in history remain gaps.
