/*
 * The icon set of design/f2-mvp/index.html, reproduced as inline SVG.
 *
 * No icon font, no icon package, no sprite request: 20 pt line icons on a 24 × 24
 * grid with a 1.8 stroke and `currentColor`, exactly as the artboard draws them.
 * An icon that carries meaning gets a `label`; every other icon is aria-hidden so
 * VoiceOver never announces a glyph the text already says (§9).
 */

import '../foundation.css';
import './icons.css';

export type IconName =
  | 'home'
  | 'train'
  | 'chart'
  | 'person'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'play'
  | 'clock'
  | 'heart'
  | 'watch'
  | 'export'
  | 'dumbbell'
  | 'barbell'
  | 'machine'
  | 'cable'
  | 'band'
  | 'calendar'
  | 'scale'
  | 'plus'
  | 'minus'
  | 'check'
  | 'moon'
  | 'backspace';

interface IconShape {
  /** Path data on the 24 × 24 grid of the artboard. */
  readonly d: string;
  /** Filled glyphs (only `play` in the artboard) drop the stroke. */
  readonly filled?: true;
}

const SHAPES: Record<IconName, IconShape> = {
  home: { d: 'M3.5 10.5 12 3.5l8.5 7V20h-6v-5.5h-5V20h-6Z' },
  train: { d: 'M3 9v6M6 8v8M18 8v8M21 9v6M6 12h12' },
  chart: { d: 'M4 19V11M10 19V6M16 19v-5M22 19V9' },
  person: { d: 'M12 4.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2ZM5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4' },
  chevronLeft: { d: 'M15 5l-7 7 7 7' },
  chevronRight: { d: 'M9 5l7 7-7 7' },
  chevronDown: { d: 'M6 9l6 6 6-6' },
  play: { d: 'M8 5.5v13l11-6.5Z', filled: true },
  clock: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5V12l3 1.8' },
  heart: { d: 'M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9Z' },
  watch: { d: 'M10 6h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM9 6l.5-3h5L15 6M9 18l.5 3h5l.5-3M12 9.5V12l1.6 1' },
  export: { d: 'M12 15V4M8 8l4-4 4 4M5 15v4h14v-4' },
  dumbbell: { d: 'M3 9v6M6 8v8M18 8v8M21 9v6M6 12h12' },
  barbell: { d: 'M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12' },
  machine: { d: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM8 15v-3a4 4 0 0 1 8 0v3' },
  cable: { d: 'M6 4v9a6 6 0 0 0 12 0V4M12 19v-3' },
  band: { d: 'M4 8c4 0 4 8 8 8s4-8 8-8M4 16c4 0 4-8 8-8s4 8 8 8' },
  calendar: { d: 'M7 6h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3ZM4 10h16M9 4v4M15 4v4' },
  scale: { d: 'M4 19V11M10 19V6M16 19v-5M22 19V9' },
  plus: { d: 'M12 5v14M5 12h14' },
  minus: { d: 'M5 12h14' },
  check: { d: 'M5 12.5l4.5 4.5L19 7.5' },
  moon: { d: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z' },
  backspace: { d: 'M9 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9L3 12zM12.5 9.5l5 5M17.5 9.5l-5 5' },
};

export interface IconProps {
  readonly name: IconName;
  /** CSS px. 20 by default; 19 inside a button, 14 inside a section label. */
  readonly size?: number | undefined;
  /** When the icon is the only carrier of meaning, pass its accessible name. */
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}

export function Icon({ name, size = 20, label, className }: IconProps): React.ReactElement {
  const shape = SHAPES[name];
  const classes = ['ds-icon', shape.filled === true ? 'ds-icon--filled' : '', className ?? '']
    .filter((part) => part !== '')
    .join(' ');

  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...(label === undefined
        ? { 'aria-hidden': true, focusable: false }
        : { role: 'img', 'aria-label': label })}
    >
      <path d={shape.d} />
    </svg>
  );
}
