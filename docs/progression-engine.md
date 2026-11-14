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

The engine's own input adds one field, and it is the narrowing §8 needs:

```ts
// src/core/engine/progression-engine.ts

export interface EngineInput extends ProgressionInput {
  /** The same outcomes, restricted to the sessions trained in the block `phaseState`
   *  is on. Absent means the caller cannot tell, and §8 reads `history`. */
  readonly blockHistory?: readonly ExerciseOutcome[];
}
```

**Two views of the history, because they answer different questions.** §7's
per-exercise rules read the whole career: a weight is consolidated across blocks and
a miss two blocks ago still counts. §8's gate asks whether *this* block has completed
its two weeks, so the weeks that already paid for an advance are not evidence for the
next one. Rule 6 hands `input.blockHistory ?? usable` to `evaluateBlock`; the `??` is
what keeps a caller with no phases to hand readable, and it is not the app's path —
the app always narrows.

The narrowing belongs to the caller because only the caller knows which block a
session was trained in. `progressionHistoryOf(sessions, { block })` in
`src/features/session/start.ts` filters the stored sessions by the phase each one
carries (`WorkoutSession.phase`, `data-model.md` §3); `buildSession` hands the result
to each exercise's `recommend`, and `phaseAdvance` hands it to `advanceProgramme`.
Without it, persisting the block advance adds one increment per session for ever,
which is the calendar moving the load instead of the verdict (S4).

The two phase types are plain tagged objects too, so the engine branches on `kind`
and never on a class:

```ts
export type TrainingPhase =
  | { readonly kind: 'normal' }
  | { readonly kind: 'readaptation'; readonly week: number };

export interface PhaseState {
  readonly block: number;                     // block currently trained: 1..4
  readonly passedBlocks: number;              // blocks already passed: 0..4
  readonly role?: BlockRole;                  // legacy fallback; the prescription's role wins
  readonly scheduledSessionsPerWeek?: number; // 3 when unset (§8); the app's liftGate resolves 1
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

`evaluateBlock(phase, state, history, now, profile?)` also takes the exercise's profile
when the caller knows it (rule 6 does); without it the phase state's role applies.

The `history` it is handed is the block's own weeks (§2), not the whole career:
`evaluateBlock` slices the two weekly windows out of what it receives
(`sessionsBetween`, which also drops an abandoned session) and decides nothing about
which weeks belong to the block — that is the caller's narrowing. The window that is
empty answers differently on purpose (`evaluateWeek`): no session in the older week is
`insufficientWeeks`, "not covered yet"; no session in the current week is
`missedSessions`, "not done".

`BlockDecision` is a plain object: `kind` is `'pass'`, `'repeat'`, `'advanceToNormal'`
or `'capReached'`; `prescriptionBlock` and `prescription` name the block that
applies next (`null` when normal rules resume), and `failedCriteria` lists the
unmet criteria for the reason line. `now` is injected so the two weekly windows are
deterministic — the engine still owns no clock.

Block prescriptions (from `training-science.md` §6), **four repetition profiles since
1.1.0**, plus the `conditioning` column 1.2.0 added:

| Block | `strength` | `hypertrophy` | `accessory` | `preventive` |
| --- | --- | --- | --- | --- |
| 1 | 3 × 6–8 @ 4–5 | 3 × 8–10 @ 4–5 | 2 × 10–12 @ 4 | 2 × 6–8 @ 5–6 |
| 2 | 3 × 6–8 @ 3–4 | 3 × 8–10 @ 3–4 | 3 × 10–12 @ 3 | 2 × 6–8 @ 5 |
| 3 | 4 × 5–8 @ 2–3 | 4 × 8–12 @ 2–3 | 3 × 10–15 @ 2–3 | 3 × 6–10 @ 4–5 |
| 4 | 4 × 5–6 @ 2 | 4 × 8–10 @ 2 | 3 × 10–12 @ 2 | 3 × 8–10 @ 3–4 |
| Repeated or capped | the block being trained | the block being trained | the block being trained | the block being trained |

A repeated block and a block at the cap prescribe **the block being trained**, not the
last one passed: `blockPrescription(block, role)` is read with the stored block, so
`repeat` and `capReached` both return `prescriptionBlock: block` and the volume the
owner is actually training at. Before 1.3.0 that row had to infer the block from
`passedBlocks` and could only step back to the last one passed, which trained the
block one step behind itself.

The `conditioning` column is not measured in repetitions: `durationSeconds` carries the
work of one set and it is the only number that grows across the blocks — 2 sets of
120 s, 3 of 120 s, 3 of 180 s, 4 of 240 s, at RIR 4–5 in every block. Its load never
moves, and rule 6 reads its increment as zero (§6).

The profile of an exercise travels inside its `ExercisePrescription.role`
(`data-model.md §3`), so rule 6 reads the column the plan declared for *that* exercise;
`PhaseState.role` is the older phase-wide fallback and `hypertrophy` the default. The
gate is unchanged, but it now compares an exercise's sets with its own prescription —
which is why the `preventive` two sets of six of the hamstring work passes block 1
while a `strength` lift needs three sets of eight in the same block
(`tests/readaptation.test.ts`).

**Status of the numbers above.** They are `training-science.md` §6's, and `BLOCK_TABLE`
no longer holds them for three of the four repetition columns: `strength`,
`hypertrophy` and `accessory` prescribe 3–4 × 8–10 at 0 RIR in every block (3, 3, 4 and
4 sets; `accessory` 2, 3, 3 and 3), the owner's own decision in
`odd/tasks/five-day-plan.md` S6 and S7. The columns are stale in their numbers, not in
their meaning, and nothing in §8's gate or in §7's order depends on which numbers they
hold. Correcting this table and carrying the squat's 1 RIR exception into the engine
belong to `odd/tasks/five-day-plan.md` T7, which is open; `preventive` is the one
column that still reads as printed here.

Gate (all four must hold across two consecutive weeks):

1. Every prescribed set completed at ≥ `bottom` reps.
2. No set taken to failure: no set whose reported effort is the failure bucket
   (`EFFORT.failure`). The effort buckets cap at 3 RIR while the block targets are
   4–5 RIR, so "effort ≤ target RIR" cannot be compared literally; the failure
   bucket is the only set the domain can call "at failure".
3. No `mild` or `pain` discomfort anywhere in the block.
4. At least `min(REQUIRED_SESSIONS_PER_WEEK, max(frequency, 1))` sessions performed
   in each of the two weeks: two of three for a programme that schedules three, and
   one for a lift in this split, which the templates train on one weekday a week.
   The frequency compared is the **lift's**, never the plan's gym days:
   `LIFT_SESSIONS_PER_WEEK` is 1, and `liftGate(state, sessionsPerWeek)` resolves it as
   the caller's `ProgrammeLift.sessionsPerWeek`, then the stored
   `PhaseState.scheduledSessionsPerWeek`, then the split's one. Measured against the
   programme's three, no lift is ever trained twice a week, so the criterion could
   never hold and the block could never move — a gate that can never pass is not a
   stricter gate, it is a broken one.

Load inside readaptation: no increase within a block; exactly one increment between
blocks, and only after a `pass` decision. Block 5+ is impossible: at the end of
block 4 the decision is `advanceToNormal`; if the cap (8 weeks) is reached first,
the decision is `capReached` and the prescription freezes.

### 8.1 The programme advances, not the exercise

`evaluateBlock` decides for one lift; a block is trained by all of them, so the block
moves at programme level: `advanceProgramme(state, lifts, now)` in
`src/core/engine/readaptation.ts` returns the next `PhaseState` or `null`, and it is
the only thing that moves `block`.

- **Every judgeable lift must pass.** One lift failing holds the whole programme where
  it is: the block is one number for the session, not one per exercise.
- **A lift with no session in the previous week is not judged.** It has no evidence
  yet, and reading `insufficientWeeks` as a failure would freeze the block for good the
  week an exercise is added.
- **Nothing moves backwards and nothing passes block 4.** `block` goes up by one at
  most, `passedBlocks` becomes the greater of itself and the block being closed, and a
  state that would come back unchanged returns `null` instead of writing.
- **The end is a state, not a fifth block.** `isReadaptationFinished` reads
  `passedBlocks >= LAST_BLOCK` (4), and from there `phaseOf` answers `normal`: §7's
  ordinary rules resume and no block is prescribed again.
- **The write happens once per closed session.** `advancePhaseAfter` in
  `src/features/session/controller.ts` reads the phase state and the recent sessions,
  asks `phaseAdvance` (`src/features/session/start.ts`) and writes what comes back;
  only an increment is written, and an abandoned session is not evidence (§2).

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
| T-26 | Readaptation block 1, gate passed | week 1, all criteria met | `increase` 102.5 (one increment), `suggestedSets` 3 (block 2), `suggestedTargetReps` 8 (block 2's own `repRange.lowerBound`, not the top of it), reason `readaptationBlockPassed` (corrected row: it read `hold` at the same weight, which §4 and §8 forbid — a passed block moves exactly one increment) |
| T-27 | Readaptation block 2, criteria unmet | the block's previous week trained and its current week not (`missedSessions`), judged over the block's own weeks (§2) | `hold` at the same weight, `suggestedSets` 3 and `suggestedTargetReps` 8 from block 2's own prescription — the block being trained, not the last one passed — reason `readaptationBlockNotPassed` |
| T-28 | Readaptation cap | week 8, gate not passed | `hold` at the same weight, the trained block's prescription (3 and 8 of block 2), reason `readaptationCapReached` with `weeks` 8, and no advance: `advanceProgramme` writes `null` |
| T-29 | Readaptation exit | block 4 passed | `evaluateBlock` returns `BlockDecision.kind` `advanceToNormal`; the recommendation for that session is `action: 'increase'` with reason `readaptationBlockPassed`, and the next call uses normal rules |
| T-30 | Unknown effort everywhere, below range | `5/5/5/5`, effort `null` | `hold` 100, reps 6 (rule 5 fires before effort matters) |
| T-31 | Dumbbell increment 2 kg | 20 kg all top | `increase` 22.0 |
| T-32 | Machine increment 5 kg | 60 kg all top | `increase` 65.0 |
| T-33 | A block just started, nothing trained in it | the weeks that earned the advance are in `history` and `blockHistory` is empty | `hold` 100, sets 3, reps 8, reason `readaptationBlockNotPassed`: the weeks that paid for block 1 are not evidence of block 2 (§2) |
| T-34 | The block's own two weeks, both `fui sobrado` | one session a week for two weeks inside the block | `increase` 102.5, reason `readaptationBlockPassed` — the lift's frequency is the one session a week of the split, and both weeks count |
| T-35 | A lift with one week of evidence | `advanceProgramme` with a lift trained in the current week only | it is not judged (§8.1): alone it answers `null`, and beside a passing lift the passing one still moves the block |

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

`ENGINE_VERSION` is `1.3.0` (`src/core/engine/progression-engine.ts`, asserted in
`tests/cold-start.test.ts`). Any change to §7 order, §8 gates or §6 rounding bumps it,
and the change must include: the affected scenario rows updated in §11.1, a note in
`docs/training-science.md` §10 if the training rule changed, and a changelog entry
in this file. A rule change without a test change is a defect.

The bumps so far, and exactly what each one changed:

| Version | What changed |
| --- | --- |
| 1.1.0 | §8's table gained four prescription profiles, and rule 6 reads the exercise's own profile (`prescription.role`) instead of the phase-wide role. No gate changed, no order changed; the numbers a recommendation returns did |
| 1.2.0 | A fifth profile, `conditioning`, prescribed by time and never by load: rule 6 reads its increment as zero, so no heavier interval is ever suggested. Every other profile returns what 1.1.0 returned |
| 1.3.0 | §8 measures a block over **its own** weeks (§2): rule 6 passes `input.blockHistory ?? usable` to `evaluateBlock`, so the weeks that already earned an advance stop paying on the next session. A repeated or capped block prescribes the block being trained instead of stepping back to `passedBlocks`, and criterion 4 is measured against the lift's frequency (`liftGate`, one session a week in this split) instead of the programme's three |

§7's order and the four gate criteria are the same in all three: what 1.3.0 changed is
the evidence the gate reads and the frequency it compares that evidence against, not the
criteria themselves or the training rule behind them — so `training-science.md` §10 has
no note to add for it. Without the narrowing, persisting the advance added one increment
per session for ever, which is the calendar moving the load (S4).
