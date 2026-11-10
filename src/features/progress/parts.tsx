/**
 * The few layout pieces the Progreso tab shares between its three views.
 *
 * A screen title, the on-screen back control of a drill-down (§8: there is no browser
 * back button in standalone mode), and the segmented control that names the metric
 * being plotted (FR-11.1). Nothing here paints: the classes live in `progress.css`
 * and take every value from the design tokens.
 */

import { Icon } from '../../design-system';

export interface DrilldownHeaderProps {
  /** The view's own title, e.g. `Historial`. */
  readonly title: string;
  /** What the back control returns to, e.g. `Progreso`. */
  readonly backLabel: string;
  readonly onBack: () => void;
}

/**
 * `‹ Progreso` plus the title. A 48 px target with a name, never a bare chevron: the
 * label is what tells the thumb what will happen (§9, S4).
 */
export function DrilldownHeader({ title, backLabel, onBack }: DrilldownHeaderProps): React.ReactElement {
  return (
    <header className="progress__header">
      <h1 className="ds-screen-title">{title}</h1>
      <button type="button" className="ds-action progress__back" onClick={onBack}>
        <Icon name="chevronLeft" size={20} />
        <span>{backLabel}</span>
      </button>
    </header>
  );
}

export interface TrashGlyphProps {
  /** CSS px, the same default as `Icon`. */
  readonly size?: number | undefined;
}

/**
 * The bin of a delete control (odd/tasks/home-hierarchy.md S5, T4).
 *
 * `design-system/components/Icon.tsx` has no bin, and this feature may not extend the
 * system: the glyph is drawn here on the same 24 × 24 grid, in `currentColor`, with the
 * system's own `.ds-icon` class so the stroke comes from the tokens. It stays
 * `aria-hidden`: the button that holds it carries the accessible name.
 */
export function TrashGlyph({ size = 20 }: TrashGlyphProps): React.ReactElement {
  return (
    <svg
      className="ds-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable={false}
    >
      <path d="M4 7h16M9.5 7V4.5h5V7M6.8 7l.7 12.5h9l.7-12.5M10.4 10.8v5.4M13.6 10.8v5.4" />
    </svg>
  );
}

export interface SegmentedProps<T extends string> {
  /** The group's name, e.g. `Métrica`. */
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

/**
 * The three-way control of the artboard's `.seg`, at the 48 px floor of §3 (the
 * artboard drew 34 px). The selected option is raised and outlined *and* the group
 * reports `aria-pressed`, so the choice is never colour alone (§4).
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>): React.ReactElement {
  return (
    <div className="progress__segment" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="ds-action progress__segment-option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
