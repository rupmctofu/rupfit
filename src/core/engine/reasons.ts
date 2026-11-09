/**
 * §4 Reason codes: fixed Spanish templates, filled from the recommendation's own
 * numbers. No sentence is generated here; every string is reviewable above.
 */

import type { BlockCriterion, ProgressionAction, ReasonCode, ReasonContext } from '../domain';

export const REASON_TEMPLATES: Record<ReasonCode, string> = {
  // The number is not written here: with four profiles the prescribed reps differ per
  // exercise, and a template that says 15 would contradict the objective line.
  insufficientData:
    'Sin historial en este ejercicio. Elige un peso con el que puedas completar las repeticiones del objetivo.',
  coldStartFromCalibration:
    'Sin historial. Partimos de tu referencia de {{reps}} repeticiones con {{kg}} kg, rebajada un 30 %.',
  topOfRangeReached:
    'Completaste {{sets}} series de {{reps}} repeticiones con {{kg}} kg. Subimos a {{next}} kg.',
  topOfRangeReachedEffortUnknown:
    'Completaste todas las series al tope de {{reps}} repeticiones. Subimos a {{next}} kg, pero no registraste el esfuerzo.',
  addRepetition: 'Vas por buen camino con {{kg}} kg. Mantén el peso y busca {{nextReps}} repeticiones.',
  belowRangeFirstTime:
    'No llegaste al mínimo de {{bottom}} repeticiones en alguna serie. Repetimos {{kg}} kg.',
  belowRangeRepeated: 'Dos sesiones seguidas por debajo del mínimo. Bajamos a {{next}} kg.',
  discomfortHold: 'Registraste molestias. Mantenemos {{kg}} kg y no subimos esta semana.',
  discomfortReduce: 'Registraste dolor. Bajamos a {{next}} kg; valora cambiar el ejercicio.',
  userLoweredLastTime:
    'La última sesión la hiciste a {{kg}} kg por decisión propia. Consolidamos ese peso antes de subir.',
  readaptationBlockPassed: 'Bloque {{week}} superado. Subimos a {{next}} kg y mantenemos el volumen.',
  readaptationBlockNotPassed: 'Repetimos el bloque {{week}} con {{kg}} kg: {{failedCriteria}}.',
  readaptationCapReached:
    'Llevamos {{weeks}} semanas en readaptación. Mantengo el peso y te propongo revisar el plan.',
  bodyweightTopOfRange: 'Llegaste al tope de repeticiones sin peso. Toca una variante más difícil.',
};

/** §4: the action each reason is paired with in the document's table. */
export const REASON_ACTIONS: Record<ReasonCode, ProgressionAction> = {
  insufficientData: 'insufficientData',
  coldStartFromCalibration: 'startFirstTime',
  topOfRangeReached: 'increase',
  topOfRangeReachedEffortUnknown: 'increase',
  addRepetition: 'hold',
  belowRangeFirstTime: 'hold',
  belowRangeRepeated: 'decrease',
  discomfortHold: 'hold',
  discomfortReduce: 'decrease',
  userLoweredLastTime: 'hold',
  readaptationBlockPassed: 'increase',
  readaptationBlockNotPassed: 'hold',
  readaptationCapReached: 'hold',
  bodyweightTopOfRange: 'hold',
};

/** The `{{failedCriteria}}` fragment of §8's reason line, in reviewable Spanish. */
export const BLOCK_CRITERIA_LABELS: Record<BlockCriterion, string> = {
  incompleteSets: 'no completaste todas las series al mínimo',
  setAtFailure: 'alguna serie llegó al fallo',
  discomfort: 'registraste molestias',
  missedSessions: 'faltaron sesiones programadas',
  insufficientWeeks: 'no hay dos semanas consecutivas registradas',
};

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function formatNumber(value: number): string {
  return value
    .toFixed(6)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

function readPlaceholder(key: string, context: ReasonContext): string | undefined {
  if (key === 'failedCriteria') {
    const criteria = context.failedCriteria;

    if (!criteria || criteria.length === 0) {
      return undefined;
    }

    return criteria.map((criterion) => BLOCK_CRITERIA_LABELS[criterion]).join(', ');
  }

  const value = (context as Record<string, unknown>)[key];

  return typeof value === 'number' && Number.isFinite(value) ? formatNumber(value) : undefined;
}

/**
 * Renders the fixed template of `reason`. A missing value is a programming error:
 * a half-built sentence is never shown to the user.
 */
export function formatReason(reason: ReasonCode, context: ReasonContext): string {
  return REASON_TEMPLATES[reason].replace(PLACEHOLDER, (_match, key: string) => {
    const value = readPlaceholder(key, context);

    if (value === undefined) {
      throw new Error(`Reason ${reason} has no value for {{${key}}}`);
    }

    return value;
  });
}
