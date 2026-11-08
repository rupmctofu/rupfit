/**
 * `Añadir un pesaje` — the one write the Peso corporal screen was missing
 * (FR-12.1, FR-12.2, S4 S6).
 *
 * One input for the weight, one date that defaults to today and can be backfilled, and
 * one button. The number is entered on the design system's keypad rather than a text
 * field, for the same reason the session uses it: `design-system` §7.4 forbids
 * `<input type="number">` (platform spinners the app cannot size) and the 48 px keys are
 * reachable with a thumb.
 *
 * The three things this screen owes the owner:
 *
 * 1. **The mean it produces.** The save resolves with the list the store now holds and a
 *    sentence naming the weight, the day and the 7-day mean — or how many samples the
 *    mean still needs. Below three samples there is no mean and no line, and the sentence
 *    says so instead of inventing one.
 * 2. **Correction, not duplication.** Saving the same day twice replaces that day's
 *    value (`weightEntry.planWeightWrite`), and the hint says so before the tap.
 * 3. **Nothing lost on failure.** The draft stays on screen, the error banner names what
 *    happened and offers `Reintentar`; a retry re-sends the same draft.
 *
 * No clock and no port are constructed here: `now` and the writer arrive from the tab.
 */

import { useCallback, useState } from 'react';
import { Banner, Card, ErrorBanner, PrimaryAction, SectionLabel, WeightKeypad } from '../../design-system';
import type { WeightSeries } from './aggregates';
import { startOfDay } from './aggregates';
import {
  checkWeightDraft,
  correctionHint,
  dayStartOfIso,
  isoDayOf,
  type WeightDraft,
  type WeightField,
  type WeightSaveOutcome,
} from './weightEntry';
import './progress.css';

export interface WeightEntryFormProps {
  /** The instant from the provider's clock: the default day, and the day rule's edge. */
  readonly now: number;
  /** The stored series: used only to say that this day is being corrected. */
  readonly series: WeightSeries;
  /** Validates, reads the day, writes once, and answers with the list the store holds. */
  readonly onSave: (draft: WeightDraft) => Promise<WeightSaveOutcome>;
}

interface FieldError {
  readonly field: WeightField;
  readonly message: string;
}

export function WeightEntryForm({ now, series, onSave }: WeightEntryFormProps): React.ReactElement {
  // `null` until the owner picks a day: until then the field follows the provider's clock,
  // so a re-read of the screen cannot leave a stale default behind.
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [weightText, setWeightText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);

  const today = isoDayOf(now);
  const day = chosenDay ?? today;
  const draft: WeightDraft = { day, weightText };
  const checked = checkWeightDraft(draft, now);
  const dayStart = dayStartOfIso(day) ?? startOfDay(now);

  const save = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setFieldError(null);

    const outcome = await onSave(draft);
    setBusy(false);

    if (outcome.kind === 'invalid') {
      setFieldError({ field: outcome.field, message: outcome.message });
      return;
    }
    if (outcome.kind === 'failed') {
      setError(outcome.message);
      return;
    }

    setNotice(outcome.notice);
    setWeightText('');
    setChosenDay(null);
  }, [draft, onSave]);

  // Hints are earned: the weight hint appears once something has been typed, and the day
  // hint only when the day itself is what is wrong.
  const weightHint =
    fieldError?.field === 'weight'
      ? fieldError.message
      : weightText === ''
        ? 'Escribe el peso en kilos, por ejemplo 78,4.'
        : checked.ok
          ? 'Se guarda en kilos, con un decimal como mucho.'
          : 'Revisa el peso: kilos, entre 20 y 300, con un decimal como mucho.';

  const dayHint =
    fieldError?.field === 'day'
      ? fieldError.message
      : !checked.ok && checked.field === 'day'
        ? checked.message
        : (correctionHint(series, dayStart) ??
          'Hoy por defecto. Puedes elegir un día anterior para rellenar un hueco.');

  return (
    <Card label="Añadir un pesaje">
      <SectionLabel>Añadir un pesaje</SectionLabel>

      {notice === null ? null : <Banner tone="success" title="Pesaje guardado" text={notice} />}
      {error === null ? null : <ErrorBanner message={error} onRetry={() => void save()} />}

      <label className="progress__field">
        <span className="ds-meta">Día del pesaje</span>
        <input
          className="progress__date"
          type="date"
          value={day}
          max={today}
          onChange={(event) => {
            setChosenDay(event.target.value);
            // A confirmation belongs to the weigh-in that produced it, not to the next one.
            setNotice(null);
          }}
          aria-describedby="progress-weight-day-hint"
        />
        <span className="ds-caption progress__hint" id="progress-weight-day-hint">
          {dayHint}
        </span>
      </label>

      <WeightKeypad
        value={weightText}
        onChange={(next) => {
          setWeightText(next);
          setNotice(null);
        }}
        onSubmit={() => void save()}
        label="Peso corporal en kilogramos"
        unit="kg"
        hint={weightHint}
        disabled={busy}
      />

      <PrimaryAction disabled={!checked.ok || busy} onClick={() => void save()}>
        {busy ? 'Guardando…' : 'Guardar el pesaje'}
      </PrimaryAction>

      <p className="ds-caption">
        Se guarda en kilogramos, sin unidad que convertir. Si vuelves a guardar el mismo día, el
        pesaje nuevo sustituye al anterior: nunca hay dos lecturas del mismo día.
      </p>
    </Card>
  );
}
