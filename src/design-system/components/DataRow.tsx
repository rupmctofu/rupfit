/*
 * The one row shape of the app: a list row with an optional badge, a state word, a
 * value and a chevron (§7.2, §7.8). Used by Entrenar, Historial, Perfil, Resumen and
 * Peso corporal.
 *
 * With `onSelect` the row is a real <button> and its accessible name is its own
 * content — title, subtitle, state word, value, chip — so VoiceOver never reads the
 * chevron as an unnamed affordance and nothing visible is dropped from the name
 * (§9). `selectLabel` overrides it for the cases where the visible words are not a
 * sentence. Without `onSelect` the row is inert text and no chevron is drawn: a
 * chevron promises navigation.
 */

import type { IconName } from './Icon';
import { Icon } from './Icon';
import '../foundation.css';
import './data-row.css';

export type DataRowState = 'none' | 'done' | 'today';
export type DataRowTone = 'muted' | 'success' | 'accent';

export interface DataRowProps {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly icon?: IconName | undefined;
  /** The 22 px marker the artboard puts before a weekday: done, today, or empty. */
  readonly state?: DataRowState | undefined;
  /** Already formatted, e.g. `8.280`. */
  readonly value?: string | undefined;
  readonly valueUnit?: string | undefined;
  readonly status?: { readonly word: string; readonly tone?: DataRowTone | undefined } | undefined;
  /** A trailing chip, e.g. `semana 2 de 4`. */
  readonly chip?: React.ReactNode | undefined;
  readonly onSelect?: (() => void) | undefined;
  /** Overrides the composed accessible name. */
  readonly selectLabel?: string | undefined;
  readonly className?: string | undefined;
}

export function DataRow(props: DataRowProps): React.ReactElement {
  const { title, subtitle, icon, state = 'none', value, valueUnit, status, chip, onSelect } = props;
  const classes = ['ds-data-row', onSelect === undefined ? '' : 'ds-data-row--control', props.className ?? '']
    .filter((p) => p !== '')
    .join(' ');

  const body = (
    <>
      {state === 'none' ? null : (
        <span
          className={`ds-data-row__state ds-data-row__state--${state}`}
          aria-hidden="true"
        >
          {state === 'done' ? <Icon name="check" size={14} /> : null}
        </span>
      )}
      {icon === undefined ? null : (
        <span className="ds-data-row__badge" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="ds-data-row__grow">
        <span className="ds-data-row__title">{title}</span>
        {subtitle === undefined ? null : <span className="ds-data-row__subtitle">{subtitle}</span>}
      </span>
      {chip === undefined ? null : <span className="ds-data-row__chip">{chip}</span>}
      {status === undefined ? null : (
        <span className={`ds-data-row__status ds-data-row__status--${status.tone ?? 'muted'}`}>
          {status.word}
        </span>
      )}
      {value === undefined ? null : (
        <span className="ds-numeral ds-numeral--inline ds-numeral--muted ds-data-row__value">
          {value}
          {valueUnit === undefined ? null : <span className="ds-numeral__unit">{valueUnit}</span>}
        </span>
      )}
      {onSelect === undefined ? null : (
        <span className="ds-data-row__chevron" aria-hidden="true">
          <Icon name="chevronRight" size={20} />
        </span>
      )}
    </>
  );

  if (onSelect === undefined) {
    return <div className={classes}>{body}</div>;
  }

  return (
    <button
      type="button"
      className={`ds-action ${classes}`}
      onClick={onSelect}
      aria-label={props.selectLabel}
    >
      {body}
    </button>
  );
}
