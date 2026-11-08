/*
 * The few layout pieces this review page needs, and the one no-op handler.
 *
 * A section is one component of src/design-system; a demo is one state of it,
 * labelled with the state's name. Nothing here paints: the classes live in
 * ./gallery.css and take every value from the design tokens.
 */

import type { ReactNode } from 'react';
import './gallery.css';

/**
 * The page is static. A component that needs a handler to render an interactive
 * shape gets this one, so no demo can pretend to change anything.
 */
export const noop = (): void => {};

export interface SectionProps {
  /** The exported component name, exactly as `src/design-system/index.ts` spells it. */
  readonly name: string;
  /** What the component is for, and which states cannot be shown at rest. */
  readonly note?: string | undefined;
  readonly children: ReactNode;
}

export function Section({ name, note, children }: SectionProps): React.ReactElement {
  return (
    <section className="gallery-section">
      <h2 className="ds-card-title">{name}</h2>
      {note === undefined ? null : <p className="ds-caption">{note}</p>}
      <div className="gallery-demos">{children}</div>
    </section>
  );
}

export interface DemoProps {
  /** The state or prop combination on screen. */
  readonly state: string;
  readonly note?: string | undefined;
  readonly children: ReactNode;
}

export function Demo({ state, note, children }: DemoProps): React.ReactElement {
  return (
    <div className="gallery-demo">
      <h3 className="ds-section-label">{state}</h3>
      {note === undefined ? null : <p className="ds-caption">{note}</p>}
      <div className="gallery-demo__body">{children}</div>
    </div>
  );
}

/** Two cells side by side, the way the decision screen pairs its compare tiles. */
export function Pair({ children }: { readonly children: ReactNode }): React.ReactElement {
  return <div className="gallery-pair">{children}</div>;
}

/** Chips and numerals that read as one row rather than one per line. */
export function Row({ children }: { readonly children: ReactNode }): React.ReactElement {
  return <div className="gallery-row">{children}</div>;
}

/** A limitation found while reviewing, written down instead of worked around. */
export function Note({ children }: { readonly children: ReactNode }): React.ReactElement {
  return <p className="ds-caption gallery-note">{children}</p>;
}
