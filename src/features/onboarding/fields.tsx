/**
 * The setup's three controls, which the design system does not have.
 *
 * Same reason Perfil's `fields.tsx` exists: a control that is used once belongs to the
 * screen, not to `src/design-system` (architecture §4 keeps the library free of feature
 * knowledge). Each one is a real `<button>` or a real input, keeps the 48 px target (§3,
 * NFR-4) and says its state in a word, never in colour alone (§4, §11).
 */

import { Chip } from '../../design-system';
import './onboarding.css';

export interface Choice<T extends string> {
  readonly value: T;
  readonly word: string;
}

export interface ChipChoicesProps<T extends string> {
  readonly label: string;
  readonly choices: readonly Choice<T>[];
  readonly selected: readonly T[];
  readonly onToggle: (value: T) => void;
}

/** Toggle chips in a named group: one goal, many equipment types. */
export function ChipChoices<T extends string>({
  label,
  choices,
  selected,
  onToggle,
}: ChipChoicesProps<T>): React.ReactElement {
  return (
    <div className="setup__chips" role="group" aria-label={label}>
      {choices.map((choice) => (
        <Chip
          key={choice.value}
          label={choice.word}
          onClick={() => onToggle(choice.value)}
          pressed={selected.includes(choice.value)}
        >
          {choice.word}
        </Chip>
      ))}
    </div>
  );
}

export interface NameFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly hint: string;
  readonly placeholder: string;
}

/** The one text field of the flow: optional, and the keyboard can close. */
export function NameField({
  value,
  onChange,
  label,
  hint,
  placeholder,
}: NameFieldProps): React.ReactElement {
  const id = 'setup-name';
  return (
    <label className="setup__field" htmlFor={id}>
      <span className="ds-meta">{label}</span>
      <input
        id={id}
        className="setup__input"
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="ds-caption" id={`${id}-hint`}>
        {hint}
      </span>
    </label>
  );
}
