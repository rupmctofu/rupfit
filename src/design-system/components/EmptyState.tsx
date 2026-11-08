/*
 * Empty state (§7.8): one sentence saying what is missing, and the single action
 * that fixes it. It never scolds, never blocks and never draws an empty chart.
 */

import '../foundation.css';
import './empty-state.css';

export interface EmptyStateAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface EmptyStateProps {
  readonly children: React.ReactNode;
  readonly action?: EmptyStateAction | undefined;
  readonly className?: string | undefined;
}

export function EmptyState({ children, action, className }: EmptyStateProps): React.ReactElement {
  const classes = ['ds-empty', className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <div className={classes}>
      <p className="ds-empty__text">{children}</p>
      {action === undefined ? null : (
        <button type="button" className="ds-action ds-empty__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
