/**
 * The four small controls Perfil needs that the design system does not have.
 *
 * They are not components of `src/design-system` on purpose: a control that exists once
 * belongs to the screen (architecture §4 keeps the library free of feature knowledge).
 * Each one is still a real `<button>` or a real input, keeps a 48 px target and shows a
 * state word, and never carries meaning in colour alone (§4, §9, §11).
 */

import { useEffect, useState } from 'react';
import { Chip } from '../../design-system';
import './profile.css';

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

/** Toggle chips in a named group: one choice for units and goals, many for equipment. */
export function ChipChoices<T extends string>({
  label,
  choices,
  selected,
  onToggle,
}: ChipChoicesProps<T>): React.ReactElement {
  return (
    <div className="profile__chips" role="group" aria-label={label}>
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

interface FieldChrome {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly multiline?: boolean | undefined;
  readonly capitalise?: boolean | undefined;
  /** Marks the hint as a match, in words as well as in colour. */
  readonly hintTone?: 'muted' | 'success' | 'danger' | undefined;
}

/** A label is a sentence, not an id: the described-by target is derived and sanitised. */
function hintId(label: string): string {
  return `profile-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-hint`;
}

function FieldShell({
  label,
  hint,
  hintTone = 'muted',
  children,
}: FieldChrome & { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <label className="profile__field">
      <span className="ds-meta">{label}</span>
      {children}
      {hint === undefined ? null : (
        <span className={`ds-caption profile__hint profile__hint--${hintTone}`} id={hintId(label)}>
          {hint}
        </span>
      )}
    </label>
  );
}

const inputProps = (label: string, hint: string | undefined) =>
  ({
    className: 'profile__input',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    'aria-describedby': hint === undefined ? undefined : hintId(label),
  }) as const;

export interface CommitFieldProps extends FieldChrome {
  readonly value: string;
  /** Called on blur, and only when the text actually changed. */
  readonly onCommit: (value: string) => void;
}

/**
 * A field that keeps its own draft: a read after the write must not swallow a
 * half-typed name, and there is no save button per field. `Enter` closes the keyboard.
 */
export function CommitField({
  label,
  hint,
  value,
  placeholder,
  multiline = false,
  capitalise = false,
  onCommit,
}: CommitFieldProps): React.ReactElement {
  const [draft, setDraft] = useState(value);

  // An import or a restore changes the stored value under the field: follow it.
  useEffect(() => setDraft(value), [value]);

  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };

  const shared = {
    ...inputProps(label, hint),
    value: draft,
    placeholder: placeholder ?? '',
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(event.target.value),
    onBlur: commit,
  };

  if (multiline) {
    return (
      <FieldShell label={label} hint={hint}>
        <textarea {...shared} rows={4} />
      </FieldShell>
    );
  }

  return (
    <FieldShell label={label} hint={hint}>
      <input
        {...shared}
        type="text"
        enterKeyHint="done"
        autoCapitalize={capitalise ? 'characters' : 'sentences'}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </FieldShell>
  );
}

export interface LiveFieldProps extends FieldChrome {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** A controlled field: the confirmation words and the pasted document live in state. */
export function LiveField({
  label,
  hint,
  hintTone,
  value,
  placeholder,
  multiline = false,
  capitalise = false,
  onChange,
}: LiveFieldProps): React.ReactElement {
  const shared = {
    ...inputProps(label, hint),
    value,
    placeholder: placeholder ?? '',
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };

  return (
    <FieldShell label={label} hint={hint} hintTone={hintTone}>
      {multiline ? (
        <textarea {...shared} rows={4} />
      ) : (
        <input type="text" {...shared} autoCapitalize={capitalise ? 'characters' : 'sentences'} />
      )}
    </FieldShell>
  );
}

export interface NoteProps {
  readonly children: React.ReactNode;
  readonly tone?: 'muted' | 'danger' | undefined;
}

/** The sentences the screen has to say and cannot put in a row. */
export function Note({ children, tone = 'muted' }: NoteProps): React.ReactElement {
  return (
    <p className={tone === 'danger' ? 'profile__note profile__note--danger' : 'profile__note'}>
      {children}
    </p>
  );
}
