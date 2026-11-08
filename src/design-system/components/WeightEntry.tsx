/*
 * Weight entry (§7.4): the decision bar, its collapsed summary, and our own keypad.
 *
 * The bar is three equal actions; the first two are one tap. `Otro peso` opens a
 * designed 4 × 3 keypad with 48 px keys, a comma key and `Listo` — not a text
 * field, so there is no OS keyboard, no cursor, no autocorrect and no dictation
 * popover over the session (§7.4, §11).
 *
 * Every label arrives formatted by the caller (comma decimal separator, thousands
 * kept as written). This file never parses or reformats a number.
 */

import { Icon } from './Icon';
import '../foundation.css';
import './weight-entry.css';

export interface LoadDecisionBarProps {
  /** Already formatted suggested weight, e.g. `92,5`. */
  readonly suggested: string;
  /** The previous weight; omitted on a first time exercise. */
  readonly previous?: string | undefined;
  readonly unit?: string | undefined;
  /** Defaults to `Aceptar {{suggested}} {{unit}}`, else `Elegir peso`. */
  readonly acceptLabel?: string | undefined;
  /** Defaults to `Repetir {{previous}}`. */
  readonly repeatLabel?: string | undefined;
  /** Defaults to `Otro peso`. */
  readonly otherLabel?: string | undefined;
  readonly onAccept: (() => void) | undefined;
  readonly onRepeat?: (() => void) | undefined;
  readonly onOther?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
}

export function LoadDecisionBar({
  suggested,
  previous,
  unit = 'kg',
  acceptLabel,
  repeatLabel,
  otherLabel = 'Otro peso',
  onAccept,
  onRepeat,
  onOther,
  disabled = false,
}: LoadDecisionBarProps): React.ReactElement {
  const accept = acceptLabel ?? (previous === undefined ? 'Elegir peso' : `Aceptar ${suggested} ${unit}`);
  const repeat = repeatLabel ?? (previous === undefined ? '' : `Repetir ${previous}`);
  const showRepeat = previous !== undefined && onRepeat !== undefined;

  return (
    <div className="ds-decision">
      <button
        type="button"
        className="ds-action ds-decision__action ds-decision__action--primary"
        onClick={onAccept}
        disabled={disabled}
      >
        {accept}
      </button>
      {showRepeat ? (
        <button
          type="button"
          className="ds-action ds-decision__action ds-decision__action--ghost"
          onClick={onRepeat}
          disabled={disabled}
        >
          {repeat}
        </button>
      ) : null}
      {onOther === undefined ? null : (
        <button
          type="button"
          className="ds-action ds-decision__action ds-decision__action--ghost"
          onClick={onOther}
          disabled={disabled}
        >
          {otherLabel}
        </button>
      )}
    </div>
  );
}

export interface WeightSummaryProps {
  /** Already formatted, e.g. `92,5`. */
  readonly weight: string;
  readonly unit?: string | undefined;
  /** `Objetivo · 3 × 10 a 3–4 RIR · descanso 180 s`, formatted by the caller. */
  readonly targetLine: string;
  readonly onDecrement: (() => void) | undefined;
  readonly onIncrement: (() => void) | undefined;
  readonly onEdit: (() => void) | undefined;
  readonly editLabel?: string | undefined;
  readonly decrementLabel?: string | undefined;
  readonly incrementLabel?: string | undefined;
  readonly disabled?: boolean | undefined;
}

/** The bar after a decision: one line, still editable between sets (FR-5.7). */
export function WeightSummary({
  weight,
  unit = 'kg',
  targetLine,
  onDecrement,
  onIncrement,
  onEdit,
  editLabel = 'Cambiar',
  decrementLabel = 'Bajar el peso',
  incrementLabel = 'Subir el peso',
  disabled = false,
}: WeightSummaryProps): React.ReactElement {
  return (
    <div className="ds-weight-summary">
      <div className="ds-row">
        <div className="ds-weight-summary__value">
          <span className="ds-caption">PESO DE HOY</span>
          <span className="ds-numeral ds-numeral--inline ds-weight-summary__weight">
            {weight}
            <span className="ds-numeral__unit">{unit}</span>
          </span>
        </div>
        <div className="ds-weight-summary__keys">
          <button
            type="button"
            className="ds-action ds-weight-summary__key"
            onClick={onDecrement}
            disabled={disabled || onDecrement === undefined}
            aria-label={decrementLabel}
          >
            <Icon name="minus" size={22} />
          </button>
          <button
            type="button"
            className="ds-action ds-weight-summary__key"
            onClick={onIncrement}
            disabled={disabled || onIncrement === undefined}
            aria-label={incrementLabel}
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
      </div>
      <div className="ds-row">
        <span className="ds-caption ds-weight-summary__target">{targetLine}</span>
        {onEdit === undefined ? null : (
          <button type="button" className="ds-action ds-weight-summary__edit" onClick={onEdit}>
            {editLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', ','] as const;

export interface WeightKeypadProps {
  /** The current entry, already formatted (`92,5`). */
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onSubmit: () => void;
  /** Accessible name of the pad, e.g. `Peso en kilogramos`. */
  readonly label: string;
  readonly unit?: string | undefined;
  readonly doneLabel?: string | undefined;
  /** Carried by aria-describedby, never aria-description (§9). */
  readonly hint?: string | undefined;
  readonly disabled?: boolean | undefined;
}

/**
 * A 4 × 3 grid of 48 px keys plus the comma, the backspace and `Listo`. A hardware
 * keyboard is honoured too: the digits, the comma, backspace and Enter work while
 * focus is anywhere inside the pad, because the keys are real buttons and the pad
 * listens for the same characters.
 */
export function WeightKeypad({
  value,
  onChange,
  onSubmit,
  label,
  unit = 'kg',
  doneLabel = 'Listo',
  hint,
  disabled = false,
}: WeightKeypadProps): React.ReactElement {
  const hintId = 'ds-keypad-hint';

  const append = (key: string): void => {
    if (key === ',' && value.includes(',')) return;
    if (value.replace(',', '').length >= 6) return;
    onChange(`${value}${key}`);
  };

  const backspace = (): void => onChange(value.slice(0, -1));

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault();
      append(event.key);
      return;
    }
    if (event.key === ',' || event.key === '.') {
      event.preventDefault();
      append(',');
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      backspace();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      className="ds-keypad"
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      {...(hint === undefined ? {} : { 'aria-describedby': hintId })}
    >
      <output className="ds-keypad__display" aria-live="polite" aria-atomic="true">
        <span className="ds-numeral ds-numeral--metric-small ds-keypad__value">
          {value === '' ? '0' : value}
          <span className="ds-numeral__unit">{unit}</span>
        </span>
      </output>
      {hint === undefined ? null : (
        <p className="ds-visually-hidden" id={hintId}>
          {hint}
        </p>
      )}
      <div className="ds-keypad__grid">
        {KEYPAD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="ds-action ds-keypad__key"
            onClick={() => append(key)}
            disabled={disabled}
            aria-label={key === ',' ? 'Coma decimal' : key}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          className="ds-action ds-keypad__key"
          onClick={backspace}
          disabled={disabled}
          aria-label="Borrar el último dígito"
        >
          <Icon name="backspace" size={22} />
        </button>
      </div>
      <button
        type="button"
        className="ds-action ds-keypad__done"
        onClick={onSubmit}
        disabled={disabled}
      >
        {doneLabel}
      </button>
    </div>
  );
}
