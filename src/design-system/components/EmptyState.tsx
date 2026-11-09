/*
 * Empty state (§7.8): one sentence saying what is missing, and the single action
 * that fixes it. It never scolds, never blocks and never draws an empty chart.
 *
 * Two shapes, because one box cannot be both quiet and primary at once:
 *   - `quiet` (default): a surface step, for the empty slot that lives under the real
 *     content of a screen that already has something to show (Inicio's pending list,
 *     the health block). It never spends the accent.
 *   - `primary`: the same box in accent fill, for the screen whose only action this is
 *     (Progreso before the first session). One per screen, never two.
 * `bare` drops the box and keeps the sentence, for the places where a box would nest
 * inside another card.
 */

import '../foundation.css';
import './empty-state.css';

export interface EmptyStateAction {
  readonly label: string;
  readonly onClick: () => void;
}

export type EmptyStateTone = 'quiet' | 'primary';

export interface EmptyStateProps {
  readonly children: React.ReactNode;
  readonly action?: EmptyStateAction | undefined;
  readonly tone?: EmptyStateTone | undefined;
  /** No surface, no border: the sentence only. */
  readonly bare?: boolean | undefined;
  readonly className?: string | undefined;
}

export function EmptyState({
  children,
  action,
  tone = 'quiet',
  bare = false,
  className,
}: EmptyStateProps): React.ReactElement {
  const classes = [
    'ds-empty',
    `ds-empty--${tone}`,
    bare ? 'ds-empty--bare' : '',
    className ?? '',
  ]
    .filter((p) => p !== '')
    .join(' ');

  return (
    <div className={classes}>
      <p className="ds-empty__text">{children}</p>
      {action === undefined ? null : (
        <button type="button" className="ds-empty__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
