# Rupfit — Progression Engine

The engine answers one question, deterministically: *given this exercise's history
and today's prescription, what weight and how many reps should the app suggest?*

It is not an AI. It has no model, no network, no clock of its own, no randomness and
no notion of the user's mood. Same input, same output, always (ADR-007). Every rule
below is traceable to `docs/training-science.md` §10 or marked as a design decision.

---

## 1. Scope and boundaries

| In scope | Out of scope |
| --- | --- |
| Suggested load, sets and target reps per exercise | Any change the user did not accept |
| A typed reason and a confidence level | Free-text coaching advice |
| Readapatation block gating | Diagnosis of pain or injury |
| Rounding to reachable weights | Plate/stack inventory solving |
| Cold start from user-supplied calibration | Inventing a load with no evidence |

**Absolute rule:** the engine returns a *recommendation*. It never writes a weight
into a session. Only an explicit user decision does that (FR-5.2).

---

## 2. What the engine is allowed to see

```ts
// src/core/domain/progression.ts

export interface ProgressionInput {
  readonly exercise: Exercise;
  readonly prescription: ExercisePrescription;
  readonly phase: TrainingPhase;                // { kind: 'readaptation'; week } | { kind: 'normal' }
  readonly phaseState: PhaseState;              // block history, passed blocks
  readonly history: readonly ExerciseOutcome[]; // newest first, same exercise
  readonly coldStart: ColdStartInput | null;    // only when history is empty
}

export interface ExerciseOutcome {
  readonly date: Date;
  readonly weightKg: number;                   // weight actually used
  readonly recommendedWeightKg: number | null; // what was suggested that day
  readonly sets: readonly SetOutcome[];        // confirmed sets only
}

export interface SetOutcome {
  readonly targetReps: number;
  readonly actualReps: number;
  readonly effort: Effort | null;              // null = unanswered
  readonly discomfort: Discomfort | null;      // null = unanswered
}

export interface ColdStartInput {
  /** The user's own recent working weight for this lift, or null if unknown. */
  readonly knownWorkingWeightKg: number | null;
  /** The rep count that weight was performed for, e.g. 5. */
  readonly knownReps: number | null;
}
```

The two phase types are plain tagged objects too, so the engine branches on `kind`
and never on a class:

```ts
export type TrainingPhase =
  | { readonly kind: 'normal' }
  | { readonly kind: 'readaptation'; readonly week: number };

export interface PhaseState {
  readonly block: number;                     // block currently trained: 1..4
  readonly passedBlocks: number;              // blocks already passed: 0..4
  readonly role?: BlockRole;                  // 'primary' | 'accessory', default 'primary'
  readonly scheduledSessionsPerWeek?: number; // default 3 (training-science §6)
}
```

`Effort` and `Discomfort` are numeric constant unions, not strings:
`EFFORT.failure` 0, `hard` 1, `correct` 2, `easy` 3; `DISCOMFORT.none` 0, `mild` 1,
`pain` 2. Ordering is therefore meaningful, and `null` is never coerced into a
bucket (invariant I-7).

Explicitly **absent** from the input type, and therefore impossible to use: heart
rate, sleep, steps, cardio load, time of day, calendar, body weight, age. Recovery
data reaches the UI as an advisory line and never reaches this function.

`history` excludes sessions with zero confirmed sets (an abandoned session is not
evidence); partial sessions with at least one confirmed set are included.

---

## 3. Output

```ts
// src/core/domain/progression.ts

export interface ProgressionRecommendation {
  readonly suggestedWeightKg: number | null; // null = "you choose, we have nothing"
  readonly suggestedSets: number;
  readonly suggestedTargetReps: number;
  readonly action: ProgressionAction;
  readonly reason: ReasonCode;
  readonly confidence: Confidence;
  readonly basedOnSessions: number;
  readonly computedAt: Date;
  readonly reasonContext: ReasonContext;     // values for the fixed Spanish template (§4)
}

export type ProgressionAction =
  | 'increase'
  | 'hold'
  | 'decrease'
  | 'startFirstTime'
  | 'insufficientData';
```

`suggestedWeightKg` is optional on purpose. With no history and no calibration the
app says "elige un peso" instead of inventing a number; a `null` suggestion is a
first-class state, not an error. `reasonContext` carries the placeholders of §4 and
is built from the recommendation's own numbers, never from free text.

---

## 4. Reason codes

Every recommendation carries exactly one typed reason, rendered from a Spanish
template. No sentence is generated; the template is fixed and reviewable.

| `ReasonCode` | Action | Spanish line shown to the user |
| --- | --- | --- |
| `insufficientData` | `insufficientData` | `Sin historial en este ejercicio. Elige un peso con el que puedas completar las repeticiones del objetivo.` |
| `coldStartFromCalibration` | `startFirstTime` | `Sin historial. Partimos de tu referencia de {{reps}} repeticiones con {{kg}} kg, rebajada un 30 %.` |
| `topOfRangeReached` | `increase` | `Completaste {{sets}} series de {{reps}} repeticiones con {{kg}} kg. Subimos a {{next}} kg.` |
| `topOfRangeReachedEffortUnknown` | `increase` | `Completaste todas las series al tope de {{reps}} repeticiones. Subimos a {{next}} kg, pero no registraste el esfuerzo.` |
| `addRepetition` | `hold` | `Vas por buen camino con {{kg}} kg. Mantén el peso y busca {{nextReps}} repeticiones.` |
| `belowRangeFirstTime` | `hold` | `No llegaste al mínimo de {{bottom}} repeticiones en alguna serie. Repetimos {{kg}} kg.` |
| `belowRangeRepeated` | `decrease` | `Dos sesiones seguidas por debajo del mínimo. Bajamos a {{next}} kg.` |
| `discomfortHold` | `hold` | `Registraste molestias. Mantenemos {{kg}} kg y no subimos esta semana.` |
| `discomfortReduce` | `decrease` | `Registraste dolor. Bajamos a {{next}} kg; valora cambiar el ejercicio.` |
| `userLoweredLastTime` | `hold` | `La última sesión la hiciste a {{kg}} kg por decisión propia. Consolidamos ese peso antes de subir.` |
| `readaptationBlockPassed` | `increase` | `Bloque {{week}} superado. Subimos a {{next}} kg y mantenemos el volumen.` |
| `readaptationBlockNotPassed` | `hold` | `Repetimos el bloque {{week}} con {{kg}} kg: {{failedCriteria}}.` |
| `readaptationCapReached` | `hold` | `Llevamos {{weeks}} semanas en readaptación. Mantengo el peso y te propongo revisar el plan.` |
| `bodyweightTopOfRange` | `hold` | `Llegaste al tope de repeticiones sin peso. Toca una variante más difícil.` |

`{{...}}` placeholders are filled from the recommendation's own numbers, never from
free text. `{{failedCriteria}}` is the one exception in shape only: it renders the
unmet gate criteria of §8 as a comma-joined list of labels, one per criterion, from
`BLOCK_CRITERIA_LABELS` in `src/core/engine/reasons.ts`, in the order the gate
reports them. The labels are fixed Spanish copy, not free text:

| Criterion | Label |
| --- | --- |
| `incompleteSets` | `no completaste todas las series al mínimo` |
| `setAtFailure` | `alguna serie llegó al fallo` |
| `discomfort` | `registraste molestias` |
| `missedSessions` | `faltaron sesiones programadas` |
| `insufficientWeeks` | `no hay dos semanas consecutivas registradas` |

---

## 5. Cold start (no usable history)

Two cases, both honest:

1. **With calibration** (`knownWorkingWeightKg` + `knownReps`): the app converts to
   a conservative start by discounting 30 % and rounding down to the increment.

   ```
   estimate = knownWorkingWeightKg × 0.70
   suggestion = roundDownToIncrement(estimate, exercise.loadIncrementKg)
   ```

   The 30 % discount is a **design decision**: the user's reference comes from
   before a long layoff, so the starting load must be comfortably submaximal
   (training-science §6). It is not a validated formula and is labelled as an
   estimate in the UI (FR-1.5).

2. **Without calibration**: `suggestedWeightKg = null`, action `insufficientData`,
   reason `insufficientData`. The UI asks for a weight the user could lift for
   about 15 reps and records what they actually do. The first real recommendation
   appears in the next session.

`confidence` is always `low` with `basedOnSessions == 0` in this section, whatever
the branch.

---

## 6. Increments, rounding and floors

```ts
// src/core/engine/rounding.ts
export function roundDownToIncrement(value: number, increment: number): number
```

- `increment == 0` means **bodyweight**: no weight arithmetic is ever performed.
  Progression is repetitions only, and at the top of the range the recommendation
  is a harder variation (`bodyweightTopOfRange`).
- `increment > 0`: every produced weight is a multiple of the increment, within
  1e-6. Increases round **down** (never overshoot the user's capability);
  decreases round **up** (never cut more than one increment); holds return the
  weight actually used, unchanged, so the app never "corrects" a real weight.
- Floor: a decrease never goes below one increment.
- Per-exercise increments come from the exercise record: barbell 2.5 kg, dumbbells
  the rack step (2 × 1 kg or 2 × 2 kg), machine per stack, cable 2.5 kg, band and
  bodyweight 0. A global 2.5 kg step is forbidden (training-science §8).

---

## 7. Decision order (first match wins)

Definitions, computed once per call:

| Symbol | Definition |
| --- | --- |
| `last` | `history[0]` |
| `top` / `bottom` | `prescription.repRange.upperBound` / `.lowerBound` |
| `allAtTop` | every confirmed set has `actualReps >= top` |
| `allInRange` | every confirmed set has `actualReps >= bottom` |
| `belowRangeCount` | count of consecutive most-recent outcomes at the same weight with any set below `bottom` |
| `hardestEffort` | the effort with the fewest RIR among answered sets; `null` if none answered |
| `anyMild` / `anyPain` | any set with `discomfort === DISCOMFORT.mild` / `DISCOMFORT.pain` |
| `allEffortUnknown` | no set in `last` has an effort answer |
| `lastWasLowered` | `last.recommendedWeightKg !== null && last.weightKg < last.recommendedWeightKg - 1e-6` |

Ordered rules:

| # | Condition | Action | Weight | Target reps | Reason |
| --- | --- | --- | --- | --- | --- |
| 1 | `history.isEmpty` | per §5 | per §5 | `bottom` | per §5 |
| 2 | `anyPain` | `decrease` | `last.weightKg − increment` (floored) | `bottom` | `discomfortReduce` |
| 3 | `anyMild` | `hold` | `last.weightKg` | `bottom` | `discomfortHold` |
| 4 | `belowRangeCount >= 2` | `decrease` | one increment down | `bottom` | `belowRangeRepeated` |
| 5 | `!allInRange` | `hold` | `last.weightKg` | `bottom` | `belowRangeFirstTime` |
| 6 | `phase.kind === 'readaptation'` | block table §8 | block table | block table | §8 |
| 7 | `lastWasLowered` | `hold` | `last.weightKg` | `bottom` | `userLoweredLastTime` |
| 8 | `allAtTop && increment === 0` | `hold` | `last.weightKg` (no arithmetic) | `bottom` | `bodyweightTopOfRange` |
| 9 | `allAtTop && !allEffortUnknown && hardestEffort <= EFFORT.hard` | `increase` | one increment up | `bottom` | `topOfRangeReached` |
| 10 | `allAtTop` (effort unknown or all `easy`) | `increase` | one increment up | `bottom` | `topOfRangeReachedEffortUnknown` |
| 11 | `allInRange && !allAtTop` | `hold` | `last.weightKg` | `min(maxActual + 1, top)` | `addRepetition` |
| 12 | otherwise (unreachable, defensive) | `hold` | `last.weightKg` | `bottom` | `addRepetition` |

Notes on the ordering:

- Pain and discomfort outrank everything except missing data. Nothing the engine
  does later can override a reported symptom.
- Rule 5 before rule 7: a session that both missed reps *and* used a lower weight
  is a missed-reps case; the lowered weight is already the baseline because
  `last.weightKg` is what was used.
- Rule 8 covers bodyweight (§6): with `increment === 0` there is no load to add, so
  the top of the range yields a hold and a harder variation, and rules 9 and 10 are
  never reached. It sits after rule 7 so a weight the user lowered on purpose is
  still consolidated first, and before rules 9 and 10 so it is reachable at all.
- Rules 9 and 10 differ only in whether effort was reported. An unanswered effort
  must not freeze progression forever (the user never tapped the button), but the
  reason line tells them why the app is less certain. Design decision.
- Rule 10 fires on `allAtTop` even when effort was `EFFORT.easy`: at the top of the
  rep range there is nowhere to add reps, so the load must move.

---

## 8. Readaptation policy

Separate pure function, called by the same engine:

```ts
// src/core/engine/readaptation.ts
export function evaluateBlock(
  phase: TrainingPhase,
  state: PhaseState,
  history: readonly ExerciseOutcome[],
  now: Date,
): BlockDecision
```

`BlockDecision` is a plain object: `kind` is `'pass'`, `'repeat'`, `'advanceToNormal'`
or `'capReached'`; `prescriptionBlock` and `prescription` name the block that
applies next (`null` when normal rules resume), and `failedCriteria` lists the
unmet criteria for the reason line. `now` is injected so the two weekly windows are
deterministic — the engine still owns no clock.

Block prescriptions (from `training-science.md` §6):

| Block | Primary sets × reps @ RIR | Accessory sets × reps @ RIR |
| --- | --- | --- |
| 1 | 2 × 10 @ 4–5 | 2 × 12 @ 4 |
| 2 | 3 × 10 @ 3–4 | 2 × 12 @ 3 |
| 3 | 3 × 8–10 @ 2–3 | 3 × 10–12 @ 2–3 |
| 4 | 4 × 8 @ 2 | 3 × 10 @ 2 |
| Hold | last passed block | last passed block |

Gate (all four must hold across two consecutive weeks):

1. Every prescribed set completed at ≥ `bottom` reps.
2. No set taken to failure: no set whose reported effort is the failure bucket
   (`EFFORT.failure`). The effort buckets cap at 3 RIR while the block targets are
   4–5 RIR, so "effort ≤ target RIR" cannot be compared literally; the failure
   bucket is the only set the domain can call "at failure".
3. No `mild` or `pain` discomfort anywhere in the block.
4. At least two of the three scheduled sessions performed.

Load inside readaptation: no increase within a block; exactly one increment between
blocks, and only after a `pass` decision. Block 5+ is impossible: at the end of
block 4 the decision is `advanceToNormal`; if the cap (8 weeks) is reached first,
the decision is `capReached` and the prescription freezes.

---

## 9. Worked examples from the brief

**Accepting an increase** — deadlift, 4 × 6 target, increment 2.5 kg.
Last session: 100 kg, sets `6/6/6/6`, effort `hard` (1 RIR), no discomfort.

```
allAtTop = true, hardestEffort = EFFORT.hard, anyMild = false, anyPain = false
→ action increase, weight 102.5, target sets 4, target reps 6
→ reason topOfRangeReached
```

**Repeat after a miss** — same lift, sets `6/6/6/4`:

```
belowRangeCount = 1 (first time at 100 kg) → hold 100, target 6, reason belowRangeFirstTime
```

Next session at 100 kg yields `5/5/5/5`:

```
belowRangeCount = 2 → decrease to 97.5, target 6, reason belowRangeRepeated
```

**User overrides downward** — the app suggested 102.5 kg, the user trained at
100 kg and completed everything at the top of the range:

```
lastWasLowered = true → hold 100 kg, reason userLoweredLastTime
```

The next session progresses from 100 kg, not from 102.5 kg, and nothing anywhere
records 100 kg as a failure (FR-5.6).

---

## 10. Confidence

| Level | Condition |
| --- | --- |
| `low` | 0 or 1 session; or discomfort in the newest outcome; or every effort in the newest outcome unanswered |
| `medium` | 2 sessions with reported effort |
| `high` | ≥ 3 sessions, consistent effort reporting, no discomfort in the last two |

Confidence never changes the recommended number: it changes the phrasing and the
UI emphasis. A recommendation is never withheld because confidence is low — it is
labelled.

---

## 11. Test specification

Implemented in `tests/` with Vitest and TypeScript; the whole suite runs with
`npx vitest run`. Each part of this document owns a file: `cold-start`, `rounding`,
`decision-order`, `reason-codes`, `confidence`, `readaptation`, `worked-examples`
and `properties` (`.test.ts`). Fixtures are literal values in `tests/fixtures.ts`;
nothing is randomised except the property tests in §11.2, whose generator seed is
recorded in the test file. Prescription unless stated: 4 sets, 6–10 rep range,
increment 2.5 kg.

### 11.1 Scenario table

| # | Scenario | Given | Expected |
| --- | --- | --- | --- |
| T-01 | No history, no calibration | empty | `insufficientData`, weight `null`, reps `bottom`, confidence `low` |
| T-02 | No history, calibration 100 kg × 5 | `coldStart` | weight `70.0` (100 × 0.7), action `startFirstTime` |
| T-03 | Calibration not a multiple of the increment | 101 kg × 5 | weight `70.0` (rounded down to 2.5) |
| T-04 | Top of range, effort `hard` | 100 kg, `10/10/10/10`, hard | `increase` 102.5, reps 6 |
| T-05 | Top of range, effort `correct` | 100 kg, all 10, correct | `increase` 102.5, reps 6 |
| T-06 | Top of range, effort `easy` | all 10, easy | `increase` 102.5, reason `topOfRangeReachedEffortUnknown` |
| T-07 | Top of range, effort unanswered | all 10, null | `increase` 102.5, same reason, confidence reduced |
| T-08 | In range, not at top | 100 kg, `6/6/6/6` | `hold` 100, reps 7 |
| T-09 | In range at mixed reps | `8/8/7/6` | `hold` 100, reps `min(8+1,10)` = 9 |
| T-10 | One rep below bottom, first time | `6/6/6/4` | `hold` 100, reps 6 |
| T-11 | Below bottom twice at same weight | T-10 then `5/5/5/5` | `decrease` 97.5, reps 6 |
| T-12 | Below bottom twice at *different* weights | 100 kg miss, then 97.5 kg miss | `hold` 97.5 (counter resets on weight change) |
| T-13 | Third consecutive miss | T-11 history again | `decrease` one more increment to 95.0, never two |
| T-14 | Decrease floor | 2.5 kg with `increment 2.5` and two consecutive misses | `decrease` 2.5 (never 0, never negative) |
| T-15 | Mild discomfort | all 10 at 100 kg, one set `mild` | `hold` 100, reps 6, reason `discomfortHold` — pain rules outrank top-of-range |
| T-16 | Pain | all 10 at 100 kg, one set `pain` | `decrease` 97.5, reason `discomfortReduce` |
| T-17 | Pain at the floor weight | 2.5 kg with pain | `decrease` 2.5, and the UI offers an exercise change |
| T-18 | User lowered, then completed at top | recommended 102.5, used 100, all 10 | `hold` 100, reason `userLoweredLastTime` |
| T-19 | User lowered, next session at top | T-18 then 100 kg all 10 | `increase` 102.5 |
| T-20 | User raised above the suggestion | recommended 100, used 105, all 6 | `hold` 105, reps 7 (no punishment, no extra jump) |
| T-21 | Bodyweight, top of range | increment 0, all 15 | `hold`, weight 0, reason `bodyweightTopOfRange` |
| T-22 | Bodyweight, in range | increment 0, `10/10/10` | `hold`, reps 11 |
| T-23 | Bodyweight, below range | increment 0, `5/5/5` | `hold`, reps 6, no weight arithmetic |
| T-24 | Abandoned session in history | last session has 0 confirmed sets | it is ignored; the previous real session drives the result |
| T-25 | Partial session with 1 set | sets `10` only | evaluated on that set; `allAtTop` true → `increase` |
| T-26 | Readaptation block 1, gate passed | week 1, all criteria met | `increase` 102.5 (one increment), `suggestedSets` 3 (block 2), `suggestedTargetReps` 10, reason `readaptationBlockPassed` (corrected row: it read `hold` at the same weight, which §4 and §8 forbid — a passed block moves exactly one increment) |
| T-27 | Readaptation block 2, criteria unmet | one session missed | `hold`, sets stay 2, reason `readaptationBlockNotPassed` |
| T-28 | Readaptation cap | week 8, gate not passed | `hold`, reason `readaptationCapReached`, no advance |
| T-29 | Readaptation exit | block 4 passed | `evaluateBlock` returns `BlockDecision.kind` `advanceToNormal`; the recommendation for that session is `action: 'increase'` with reason `readaptationBlockPassed`, and the next call uses normal rules |
| T-30 | Unknown effort everywhere, below range | `5/5/5/5`, effort `null` | `hold` 100, reps 6 (rule 5 fires before effort matters) |
| T-31 | Dumbbell increment 2 kg | 20 kg all top | `increase` 22.0 |
| T-32 | Machine increment 5 kg | 60 kg all top | `increase` 65.0 |

### 11.2 Property tests

For randomly generated valid inputs (deterministic seed, recorded in the test):

- **P-1 Purity** — the same input returns an equal output on repeated calls.
- **P-2 Granularity** — every returned weight with `increment > 0` is within 1e-6
  of a multiple of that increment.
- **P-3 No invention** — with empty history and no calibration, the weight is `null`.
- **P-4 Symptom safety** — if any set reports pain, the result is `decrease` or
  `hold`, never `increase`.
- **P-5 Bounded step** — a `decrease` never moves more than one increment below
  `last.weightKg`; an `increase` never moves more than one increment above it.
- **P-6 No negative weight** — weight is always `>= 0` and `>= increment` whenever
  the action is `decrease`.
- **P-7 Reps inside the range** — `suggestedTargetReps` is always within
  `prescription.repRange` (or equal to `bottom` when the range is empty).
- **P-8 Monotone reason** — changing only `history` from "all at top" to "all below
  bottom" never yields `increase`.

### 11.3 What must not be tested (and why)

There is no test that "the recommendation is good": that is a training-outcome
claim this product cannot make. There is also no test involving HealthKit, the
clock or the UI — the engine has no access to them, and a test that mocks them here
would hide a leak in the boundary.

---

## 12. Versioning the rules

`ENGINE_VERSION` is `1.0.0`. Any change to §7 order, §8 gates or §6 rounding bumps it,
and the change must include: the affected scenario rows updated in §11.1, a note in
`docs/training-science.md` §10 if the training rule changed, and a changelog entry
in this file's git history. A rule change without a test change is a defect.
