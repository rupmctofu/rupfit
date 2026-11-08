/**
 * §4 Reason codes: every recommendation carries exactly one typed reason, and the
 * Spanish line is a fixed template filled from the recommendation's own numbers.
 */

import { describe, expect, it } from 'vitest';
import { formatReason, recommend, REASON_ACTIONS, REASON_TEMPLATES } from '../src/core/engine';
import type { ProgressionInput, ReasonCode } from '../src/core/domain';
import { REASON_CODES } from '../src/core/domain';
import {
  barbellExercise,
  bodyweightExercise,
  calibration,
  DISCOMFORT,
  EFFORT,
  daysBefore,
  makeInput,
  makeOutcome,
  makePrescription,
  makeSet,
  NOW,
  readaptationPhase,
} from './fixtures';

describe('§4 the reason catalogue', () => {
  it('§4 declares exactly the fourteen reasons of the document', () => {
    expect([...REASON_CODES].sort()).toEqual(
      [
        'addRepetition',
        'belowRangeFirstTime',
        'belowRangeRepeated',
        'bodyweightTopOfRange',
        'coldStartFromCalibration',
        'discomfortHold',
        'discomfortReduce',
        'insufficientData',
        'readaptationBlockNotPassed',
        'readaptationBlockPassed',
        'readaptationCapReached',
        'topOfRangeReached',
        'topOfRangeReachedEffortUnknown',
        'userLoweredLastTime',
      ].sort(),
    );
  });

  it('§4 every reason has a Spanish template', () => {
    for (const reason of REASON_CODES) {
      expect(typeof REASON_TEMPLATES[reason]).toBe('string');
      expect(REASON_TEMPLATES[reason].length).toBeGreaterThan(0);
    }
  });

  it('§4 the templates are the lines written in the document', () => {
    expect(REASON_TEMPLATES.insufficientData).toBe(
      'Sin historial en este ejercicio. Elige un peso con el que puedas hacer 15 repeticiones.',
    );
    expect(REASON_TEMPLATES.coldStartFromCalibration).toBe(
      'Sin historial. Partimos de tu referencia de {{reps}} repeticiones con {{kg}} kg, rebajada un 30 %.',
    );
    expect(REASON_TEMPLATES.topOfRangeReached).toBe(
      'Completaste {{sets}} series de {{reps}} repeticiones con {{kg}} kg. Subimos a {{next}} kg.',
    );
    expect(REASON_TEMPLATES.topOfRangeReachedEffortUnknown).toBe(
      'Completaste todas las series al tope de {{reps}} repeticiones. Subimos a {{next}} kg, pero no registraste el esfuerzo.',
    );
    expect(REASON_TEMPLATES.addRepetition).toBe(
      'Vas por buen camino con {{kg}} kg. Mantén el peso y busca {{nextReps}} repeticiones.',
    );
    expect(REASON_TEMPLATES.belowRangeFirstTime).toBe(
      'No llegaste al mínimo de {{bottom}} repeticiones en alguna serie. Repetimos {{kg}} kg.',
    );
    expect(REASON_TEMPLATES.belowRangeRepeated).toBe(
      'Dos sesiones seguidas por debajo del mínimo. Bajamos a {{next}} kg.',
    );
    expect(REASON_TEMPLATES.discomfortHold).toBe(
      'Registraste molestias. Mantenemos {{kg}} kg y no subimos esta semana.',
    );
    expect(REASON_TEMPLATES.discomfortReduce).toBe(
      'Registraste dolor. Bajamos a {{next}} kg; valora cambiar el ejercicio.',
    );
    expect(REASON_TEMPLATES.userLoweredLastTime).toBe(
      'La última sesión la hiciste a {{kg}} kg por decisión propia. Consolidamos ese peso antes de subir.',
    );
    expect(REASON_TEMPLATES.readaptationBlockPassed).toBe(
      'Bloque {{week}} superado. Subimos a {{next}} kg y mantenemos el volumen.',
    );
    expect(REASON_TEMPLATES.readaptationBlockNotPassed).toBe(
      'Repetimos el bloque {{week}} con {{kg}} kg: {{failedCriteria}}.',
    );
    expect(REASON_TEMPLATES.readaptationCapReached).toBe(
      'Llevamos {{weeks}} semanas en readaptación. Mantengo el peso y te propongo revisar el plan.',
    );
    expect(REASON_TEMPLATES.bodyweightTopOfRange).toBe(
      'Llegaste al tope de repeticiones sin peso. Toca una variante más difícil.',
    );
  });

  it('§4 each reason declares the action the document pairs it with', () => {
    expect(REASON_ACTIONS.insufficientData).toBe('insufficientData');
    expect(REASON_ACTIONS.coldStartFromCalibration).toBe('startFirstTime');
    expect(REASON_ACTIONS.topOfRangeReached).toBe('increase');
    expect(REASON_ACTIONS.topOfRangeReachedEffortUnknown).toBe('increase');
    expect(REASON_ACTIONS.addRepetition).toBe('hold');
    expect(REASON_ACTIONS.belowRangeFirstTime).toBe('hold');
    expect(REASON_ACTIONS.belowRangeRepeated).toBe('decrease');
    expect(REASON_ACTIONS.discomfortHold).toBe('hold');
    expect(REASON_ACTIONS.discomfortReduce).toBe('decrease');
    expect(REASON_ACTIONS.userLoweredLastTime).toBe('hold');
    expect(REASON_ACTIONS.readaptationBlockPassed).toBe('increase');
    expect(REASON_ACTIONS.readaptationBlockNotPassed).toBe('hold');
    expect(REASON_ACTIONS.readaptationCapReached).toBe('hold');
    expect(REASON_ACTIONS.bodyweightTopOfRange).toBe('hold');
  });
});

describe('§4 template rendering', () => {
  it('§4 fills the placeholders from the recommendation numbers', () => {
    expect(formatReason('topOfRangeReached', { sets: 4, reps: 10, kg: 100, next: 102.5 })).toBe(
      'Completaste 4 series de 10 repeticiones con 100 kg. Subimos a 102.5 kg.',
    );
    expect(formatReason('addRepetition', { kg: 100, nextReps: 7 })).toBe(
      'Vas por buen camino con 100 kg. Mantén el peso y busca 7 repeticiones.',
    );
    expect(formatReason('coldStartFromCalibration', { reps: 5, kg: 70 })).toBe(
      'Sin historial. Partimos de tu referencia de 5 repeticiones con 70 kg, rebajada un 30 %.',
    );
    expect(formatReason('belowRangeFirstTime', { bottom: 6, kg: 100 })).toBe(
      'No llegaste al mínimo de 6 repeticiones en alguna serie. Repetimos 100 kg.',
    );
    expect(formatReason('readaptationBlockNotPassed', { week: 3, kg: 100, failedCriteria: ['missedSessions'] })).toBe(
      'Repetimos el bloque 3 con 100 kg: faltaron sesiones programadas.',
    );
    expect(
      formatReason('readaptationBlockNotPassed', {
        week: 3,
        kg: 100,
        failedCriteria: ['incompleteSets', 'setAtFailure'],
      }),
    ).toBe(
      'Repetimos el bloque 3 con 100 kg: no completaste todas las series al mínimo, alguna serie llegó al fallo.',
    );
  });

  it('§4 a reason without placeholders renders unchanged', () => {
    expect(formatReason('insufficientData', {})).toBe(
      'Sin historial en este ejercicio. Elige un peso con el que puedas hacer 15 repeticiones.',
    );
  });

  it('§4 an unresolved placeholder is a programming error, never a half-built sentence', () => {
    expect(() => formatReason('topOfRangeReached', { sets: 4, reps: 10, kg: 100 })).toThrow(/next/);
  });
});

/** One input per reason, so the catalogue is proven to be reachable. */
function scenarios(): Record<ReasonCode, ProgressionInput> {
  const twoWeeksPassing = [2, 5, 8, 11].map((daysAgo) =>
    makeOutcome({
      weightKg: 100,
      date: daysBefore(daysAgo),
      sets: [makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.easy })],
    }),
  );
  const twoWeeksIncomplete = [2, 5, 8, 11].map((daysAgo) =>
    makeOutcome({
      weightKg: 100,
      date: daysBefore(daysAgo),
      sets: [makeSet(10, { effort: EFFORT.easy })],
    }),
  );
  const oneMissedSession = [
    makeOutcome({
      weightKg: 100,
      date: daysBefore(3),
      sets: [makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.easy })],
    }),
    makeOutcome({
      weightKg: 100,
      date: daysBefore(9),
      sets: [makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.easy })],
    }),
    makeOutcome({
      weightKg: 100,
      date: daysBefore(12),
      sets: [makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.easy })],
    }),
  ];

  return {
    insufficientData: makeInput(),
    coldStartFromCalibration: makeInput({ coldStart: calibration(100, 5) }),
    topOfRangeReached: makeInput({
      history: [makeOutcome({ weightKg: 100, reps: [10, 10, 10, 10], effort: EFFORT.hard })],
    }),
    topOfRangeReachedEffortUnknown: makeInput({
      history: [makeOutcome({ weightKg: 100, reps: [10, 10, 10, 10], effort: EFFORT.easy })],
    }),
    addRepetition: makeInput({ history: [makeOutcome({ weightKg: 100, reps: [6, 6, 6, 6] })] }),
    belowRangeFirstTime: makeInput({ history: [makeOutcome({ weightKg: 100, reps: [6, 6, 6, 4] })] }),
    belowRangeRepeated: makeInput({
      history: [
        makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5] }),
        makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5] }),
      ],
    }),
    discomfortHold: makeInput({
      history: [
        makeOutcome({
          weightKg: 100,
          reps: [10, 10, 10, 10],
          effort: EFFORT.hard,
          sets: [
            ...Array.from({ length: 3 }, () => makeSet(10, { effort: EFFORT.hard })),
            makeSet(10, { effort: EFFORT.hard, discomfort: DISCOMFORT.mild }),
          ],
        }),
      ],
    }),
    discomfortReduce: makeInput({
      history: [
        makeOutcome({
          weightKg: 100,
          reps: [10, 10, 10, 10],
          effort: EFFORT.hard,
          sets: [makeSet(10, { effort: EFFORT.hard, discomfort: DISCOMFORT.pain })],
        }),
      ],
    }),
    userLoweredLastTime: makeInput({
      history: [makeOutcome({ weightKg: 100, reps: [10, 10, 10, 10], effort: EFFORT.hard, recommendedWeightKg: 102.5 })],
    }),
    readaptationBlockPassed: makeInput({
      phase: readaptationPhase(1),
      phaseState: { block: 1, passedBlocks: 0 },
      history: twoWeeksPassing,
    }),
    readaptationBlockNotPassed: makeInput({
      phase: readaptationPhase(2),
      phaseState: { block: 1, passedBlocks: 0 },
      history: twoWeeksIncomplete,
    }),
    readaptationCapReached: makeInput({
      phase: readaptationPhase(8),
      phaseState: { block: 2, passedBlocks: 1 },
      history: oneMissedSession,
    }),
    bodyweightTopOfRange: makeInput({
      exercise: bodyweightExercise(),
      prescription: makePrescription({ bottom: 12, top: 15 }),
      history: [makeOutcome({ weightKg: 0, reps: [15, 15, 15], effort: EFFORT.hard })],
    }),
  };
}

describe('§4 every named reason is reachable and renderable', () => {
  const catalogue = scenarios();

  for (const reason of REASON_CODES) {
    it(`§4 ${reason} is produced with its documented action and a rendered line`, () => {
      const recommendation = recommend(catalogue[reason], NOW);

      expect(recommendation.reason).toBe(reason);
      expect(recommendation.action).toBe(REASON_ACTIONS[reason]);

      const line = formatReason(recommendation.reason, recommendation.reasonContext);
      expect(line).not.toContain('{{');
      expect(line.length).toBeGreaterThan(0);
    });
  }

  it('§4 every reason line is one of the fixed templates of the document', () => {
    for (const reason of REASON_CODES) {
      const recommendation = recommend(catalogue[reason], NOW);
      const line = formatReason(recommendation.reason, recommendation.reasonContext);
      const template = REASON_TEMPLATES[reason];

      // The rendered line is the template with placeholders substituted, never a
      // generated sentence.
      const head = template.split('{{')[0] ?? '';
      const tail = template.split('}}').at(-1) ?? '';
      expect(line.startsWith(head)).toBe(true);
      expect(line.endsWith(tail)).toBe(true);
    }
  });
});

describe('§3 and §4 the recommendation carries one typed reason', () => {
  it('§3 the reason is always a declared code', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: [7, 7, 7, 7] })] }),
      NOW,
    );

    expect(REASON_CODES).toContain(recommendation.reason);
  });

  it('§2 and §3 the engine never returns advice for data it cannot see', () => {
    const recommendation = recommend(
      makeInput({ exercise: barbellExercise({ loadIncrementKg: 2.5 }) }),
      NOW,
    );

    expect(recommendation.reason).toBe('insufficientData');
  });
});
