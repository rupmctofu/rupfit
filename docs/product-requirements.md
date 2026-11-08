# Rupfit — Product Requirements

Status: draft for approval. No requirement here is implemented.
Source: the product brief supplied by the owner (Spanish, 18 sections). Where a
requirement quotes UI copy or a rule verbatim, the Spanish string is preserved
because it is the actual interface text.

Legend for every requirement:

- **MUST** / **SHOULD** / **MUST NOT** — obligation level.
- Phase tag: `MVP` (first functional version), `P1` (immediately after MVP),
  `OUT` (explicitly excluded; recorded so it is not re-litigated).

---

## 1. Vision

One sentence: *open Rupfit, press "Empezar entrenamiento", and the app tells you
what to lift — with the previous session in front of you and your decision as the
final word.*

The product is a personal tool for a single user returning to strength training
after roughly a year away. It must behave like a coach that remembers everything,
not like a content platform.

Success is measured by one thing: the training screen is usable mid-set, with one
hand, in a gym, without thinking.

## 2. Non-goals

- **MUST NOT** contain social features: feeds, friends, sharing, rankings.
- **MUST NOT** contain gamification: badges, streaks that punish, challenges,
  points, levels.
- **MUST NOT** target maximum hypertrophy or bodybuilding contest preparation.
- **MUST NOT** be a running/cycling tracker.
- **MUST NOT** provide medical diagnosis, treatment or advice. Heart rate, sleep
  and body-composition data are context, never a clinical interpretation.
- **MUST NOT** require an account, a backend, a subscription or a network
  connection to train.
- **MUST NOT** send HealthKit data to any external service, including any LLM.

## 3. User and usage context

| Attribute | Value |
| --- | --- |
| Devices | iPhone (primary, in the gym). Apple Watch (P1). Mac not involved. |
| Training history | ~12 months without strength training; returning progressively |
| Frequency | 3 strength sessions/week (Mon/Wed/Fri) + 1 intense cardio session (Thu) |
| Goals (in priority order) | general strength, physical condition and metabolic health, body-fat reduction, maintain/gain lean mass, body composition, long-term sustainability |
| Session environment | gym, one hand free, dim light, sweaty fingers, between 45 and 75 minutes |
| Constraint | no text entry during a session; every interaction must be a tap on a large target |

Goals are priorities, not mutually exclusive targets. The product never promises
an outcome; it organises training and surfaces progress.

## 4. Functional requirements

### FR-1 Onboarding and profile — MVP

- **FR-1.1 MUST** capture, in at most three screens: display name (optional),
  body weight with unit, weekly training days, available equipment, and body-weight
  goal (`Mantener peso` / `Perder peso` / `Ganar peso`, optional).
- **FR-1.2 MUST** default the weekly plan to the three-day template of FR-3.
- **FR-1.3 MUST** allow every onboarding value to be changed later from
  `Perfil`.
- **FR-1.4 MUST NOT** require an account, email or password.
- **FR-1.5 SHOULD** derive a conservative starting load for each primary lift from
  a short calibration input (recent estimated 5-rep capacity, or "no idea"), and
  MUST label it as an estimate until real sessions exist (see
  `docs/progression-engine.md` §5).

### FR-2 Exercise library — MVP

- **FR-2.1 MUST** ship a seed library of at least 40 exercises covering squat,
  hinge, horizontal push, vertical push, horizontal pull, vertical pull, isolation
  and core, each with muscle group, movement pattern, equipment and a configurable
  load increment.
- **FR-2.2 MUST** allow user-created custom exercises with the same attributes.
- **FR-2.3 MUST** allow per-exercise configuration of: target sets, target rep
  range, rest duration, load increment, and optional note.
- **FR-2.4 MUST NOT** block on media: every screen works with the exercise name and
  its equipment glyph when no image exists. When an exercise has media, it is one
  licensed image of that movement, shown above the text — never behind it, never
  instead of the name, the weight or the reason. Adopted 2026-11-08; the placeholder
  rule lives in `docs/design-system.md` §6.2.
- **FR-2.5 MUST** keep historical sessions intact when an exercise is renamed,
  archived or deleted (see `docs/data-model.md` invariant I-4).

### FR-3 Routine and schedule — MVP

- **FR-3.1 MUST** ship the three-day template verbatim:

  | Day | Name | Primary lift |
  | --- | --- | --- |
  | Monday | `SENTADILLA / PIERNA` | Sentadilla trasera |
  | Wednesday | `PESO MUERTO / TRACCIÓN` | Peso muerto convencional |
  | Friday | `PRESS BANCA / EMPUJE` | Press banca |

- **FR-3.2 MUST** ship these accessory suggestions per day, editable and
  reorderable: *Pierna* — prensa, zancadas o unilateral, curl femoral, gemelos,
  core; *Tracción* — remo, jalón al pecho o dominadas asistidas, face pulls,
  curl de bíceps, cadena posterior; *Empuje* — press inclinado con mancuernas,
  press de hombro, elevaciones laterales, extensiones de tríceps, espalda alta.
- **FR-3.3 MUST** allow: add exercise, remove exercise, reorder, change sets and
  reps, substitute an exercise for an alternative, and set weights and increments.
- **FR-3.4 MUST** support scheduling by calendar date with the weekday template as
  a default, not as a hard-coded day name.
- **FR-3.5 MUST** track progression history and recommendations for accessory
  exercises exactly as for primary lifts. Primary lifts differ only in emphasis in
  the UI (FR-6.4), never in engine treatment.
- **FR-3.6 SHOULD** support skipping a day without breaking the weekly pattern, and
  offer to train the skipped day on the next available date.

### FR-4 Readaptation phase — MVP

- **FR-4.1 MUST** start every new user in the readaptation phase, not in the
  normal programme.
- **FR-4.2 MUST** limit the phase to conservative loads and volume ramping over
  four weeks (protocol in `docs/training-science.md` §6).
- **FR-4.3 MUST NOT** perform maximal-strength testing (`1RM`, `3RM`, AMRAP) or
  prescribe training to failure during the phase.
- **FR-4.4 MUST** gate each week's progression on the exit criteria, not on the
  calendar: complete all target reps, no set reported harder than the block's
  target effort (bucket rule in `docs/training-science.md` §6), no reported
  discomfort, and at least 2 of 3 sessions attended, observed within that week's
  block.
- **FR-4.5 MUST** extend the phase beyond four weeks while criteria are unmet, up
  to a hard cap of eight weeks, then hold the last week's prescription and surface
  a review prompt instead of silently advancing.
- **FR-4.6 MUST** let the user accept or decline the phase transition explicitly.
- **FR-4.7 MUST** present the phase and week in the training UI so the intended
  intensity is never a surprise.

### FR-5 Load recommendation and user decision — MVP

- **FR-5.1 MUST** show, before the first set of each exercise: previous session's
  weight, previous session's result, today's recommended weight, the reason, and
  three actions — accept, repeat the previous weight, enter another weight.
- **FR-5.2 MUST** treat the engine output as a recommendation. The user's decision
  is the recorded load. The app **MUST NOT** change a user-selected weight.
- **FR-5.3 MUST** record both the recommended and the actually used weight, and
  their difference, on every exercise session.
- **FR-5.4 MUST** explain the recommendation in one sentence derived from a typed
  reason code, not from free-text generation.
- **FR-5.5 MUST** indicate missing data explicitly: with no usable history the app
  says so and offers a conservative starting point, never a confident guess.
- **FR-5.6 MUST NOT** treat a voluntarily reduced weight as a failure, and
  **MUST NOT** infer failure from a load drop alone.
- **FR-5.7 MUST** allow the weight to be edited between sets of the same exercise.

### FR-6 Workout execution — MVP

- **FR-6.1 MUST** open the session on the day's plan with one primary action:
  `Empezar entrenamiento`.
- **FR-6.2 MUST** present one exercise per card, navigable by horizontal swipe
  (left = next, right = previous) **and** by always-visible buttons. Gesture-only
  navigation is not acceptable.
- **FR-6.3 MUST** show on the exercise card: exercise name, position in the
  session ("Ejercicio 3 de 6"), previous weight, recommended weight, the one-line
  reason, target sets and reps, the per-set log, the rest timer, a weight-edit
  action, and a finish-exercise action.
- **FR-6.4 SHOULD** give the primary lift of the day visual prominence without
  giving it different logic.
- **FR-6.5 MUST** persist every set record the moment it is confirmed, so an
  app kill loses at most the set in progress.
- **FR-6.6 MUST** restore an interrupted session to the exact exercise, set and
  timer state on relaunch, and offer either resume or discard-and-save-partial.
- **FR-6.7 MUST** complete in at most two taps per set: confirm reps, done.
- **FR-6.8 MUST NOT** require text input during a session.

### FR-7 Set logging — MVP

- **FR-7.1 MUST** record per set: weight used, target reps, actual reps, whether
  the target was met, and an optional discomfort flag.
- **FR-7.2 MUST** use a fixed vocabulary for effort and discomfort rather than
  free text: effort `fácil` / `correcto` / `duro` / `fallo` (maps to reps in
  reserve 3+ / 2 / 1 / 0) and discomfort `ninguna` / `molestia` / `dolor`.
- **FR-7.3 MUST** default effort and discomfort to unanswered, so an unanswered
  set is never silently read as "easy" or "no discomfort".
- **FR-7.4 MUST** allow correcting a logged set after the fact, including from the
  session summary.
- **FR-7.5 MUST** mark a set as completed only on explicit confirmation.

### FR-8 Rest timer — MVP

- **FR-8.1 MUST** start from the exercise's configured rest duration after each
  confirmed set, unless auto-start is disabled in settings.
- **FR-8.2 MUST** notify by haptic and sound at the end, honouring silent mode and
  the system haptic setting, and **MUST NOT** depend on a notification permission.
- **FR-8.3 MUST** allow skip and extend (`+15 s`, `+30 s`) with a single tap each.
- **FR-8.4 MUST** remain accurate across backgrounding and app relaunch.

### FR-9 Session completion — MVP

- **FR-9.1 MUST** show a summary on finish: duration, exercises performed, sets
  completed against prescribed, total volume, any personal records, and adherence.
- **FR-9.2 MUST** save the session automatically; there is no "save" button whose
  absence could lose data.
- **FR-9.3 MUST** allow finishing an incomplete session and record it as partial.

### FR-10 History — MVP

- **FR-10.1 MUST** list past sessions newest first with date, day name, duration
  and volume.
- **FR-10.2 MUST** open a session read-out with per-exercise, per-set detail and
  the recommendation that was shown at the time.
- **FR-10.3 MUST** show, per exercise, the chronological log of sets and weights.

### FR-11 Progress and statistics — MVP

- **FR-11.1 MUST** plot per-exercise strength progression over time, with the
  metric choice explicit (top-set weight, estimated 1RM, session volume).
- **FR-11.2 MUST** show personal records per exercise and per rep target with the
  date achieved.
- **FR-11.3 MUST** show weekly volume per muscle group.
- **FR-11.4 MUST** label estimated values (e1RM) as estimates and state the
  formula version used.
- **FR-11.5 MUST NOT** display charts that have no decision value for the user.
- **FR-11.6 SHOULD** compare body-weight trend against the three primary lifts on
  one screen (FR-12.6).

### FR-12 Body weight and composition — MVP / P1

- **FR-12.1 MUST** record body weight manually and import it from Apple Health.
- **FR-12.2 MUST** show a daily series, a 7-day rolling mean as the headline
  metric, and period comparisons.
- **FR-12.3 MUST** support an optional body-weight goal without framing the
  rolling mean as a target that must be hit.
- **FR-12.4 MUST NOT** use BMI as the primary or sole health indicator.
- **FR-12.5 MUST** store and export measurement types for waist, chest, arm,
  thigh, hip and body-fat percentage; the UI for them is `P1`.
- **FR-12.6 MUST** allow comparing body-weight trend with squat, deadlift and
  bench progression.

### FR-13 Cardio and general activity — MVP (read), P1 (manual entry polish)

- **FR-13.1 MUST** read cardio workouts from Apple Health and show weekly activity
  and intense-cardio days.
- **FR-13.2 MUST** show recovery context (yesterday's intense session, elevated
  resting heart rate, poor sleep) as an explained warning only.
- **FR-13.3 MUST NOT** change a strength load automatically because of cardio;
  the recommendation is unaffected and the user decides.
- **FR-13.4 MUST** distinguish measured data from HealthKit, manual data and
  estimated data in the UI and in storage.
- **FR-13.5 SHOULD** allow manual entry of an unsynced activity.

### FR-14 Apple Health — MVP (read only)

- **FR-14.1 MUST** request per-type read permission with a plain-language purpose
  for each type.
- **FR-14.2 MUST** handle unavailable, undetermined and revoked access as distinct
  states, and **MUST NOT** claim that a read permission was "denied" — iOS does
  not disclose read-permission status (see `docs/architecture.md` §7).
- **FR-14.3 MUST NOT** write to HealthKit in the MVP.
- **FR-14.4 MUST** function fully with every permission refused.
- **FR-14.5 MUST** request nothing during a workout session.

### FR-15 Apple Watch — OUT for MVP, architecture in MVP

- **FR-15.1 MUST** keep the watch contract (`WatchConnectivity` message schema,
  versioned) defined from the start, with the iPhone as the source of truth.
- **FR-15.2 MUST NOT** ship a watch app in the MVP.
- **FR-15.3** Planned `P1`: view today's session, current exercise, sets and reps,
  log a set, rest countdown, haptic alerts.

### FR-16 Privacy and data handling — MVP

- **FR-16.1 MUST** store all data locally; there is no server.
- **FR-16.2 MUST NOT** transmit health or training data off-device.
- **FR-16.3 MUST** export the full dataset as a documented JSON document on demand
  (user-owned backup), and import it back.
- **FR-16.4 MUST** delete everything on request with no partial residue.
- **FR-16.5 MUST** keep HealthKit-derived data read-only and attributable to its
  source.

## 5. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Fully offline. Cold launch to interactive in under 1.5 s on iPhone 12 or newer. |
| NFR-2 | Confirming a set and seeing the next state: under 100 ms perceived, no spinner, no network. |
| NFR-3 | No crash may lose a confirmed set. Persist-before-confirm. |
| NFR-4 | Dynamic Type up to XXL, VoiceOver labels on every control, 44×44 pt minimum target, WCAG AA contrast in both modes. |
| NFR-5 | Swift 5 language mode with `-strict-concurrency=complete`; no data-race warnings (warnings are errors in CI); domain types `Sendable`. Amended 2026-11-08: Swift 6 language mode needs Xcode 16, which needs macOS 14+, which this build Mac cannot run — decision in `docs/environment.md` §3. |
| NFR-6 | UI copy in Spanish (owner's language); code, tests, comments and these documents in English. |
| NFR-7 | Metric units canonical in storage; imperial is display-only, configurable. |
| NFR-8 | Zero third-party runtime dependencies. |
| NFR-9 | Accessibility: no gesture-only action; Reduce Motion honoured; colour never the sole carrier of meaning. |

## 6. Acceptance criteria for the MVP

The MVP is accepted when all of the following hold on a physical iPhone:

1. A new install reaches the readaptation week-1 prescription without an account.
2. For each of the six seeded exercises of the Monday template, the app shows the
   previous session's weight, a recommended weight, and a one-line reason, or an
   explicit "no data yet" state.
3. Accepting, repeating and overriding a weight each produce a stored
   `LoadDecision` with the delta between recommended and used weight.
4. A full session can be logged with two taps per set, and killing the app after
   set 2 of 4 restores exactly that position on relaunch.
5. The summary reports duration, sets completed vs prescribed, total volume and
   any PR — with every number traceable to stored set records.
6. History shows that same session with the recommendation it displayed at the
   time (not a recomputed one).
7. Progress shows at least one per-exercise progression chart and a body-weight
   rolling mean.
8. With all Health permissions refused, every MVP flow still works and the UI
   states clearly that no health data is available.
9. The engine test suite listed in `docs/progression-engine.md` §8 passes.

## 7. Resolved contradictions (decisions and where they live)

| # | Tension in the brief | Resolution | Document |
| --- | --- | --- | --- |
| 1 | Deterministic engine (§5) vs. recovery context (§5, §7) | Recovery never enters the load calculation; it is presentation-only context | `progression-engine.md` §2 |
| 2 | Readaptation "adjusted to real evolution" without criteria | Explicit gate criteria plus a hard cap | `training-science.md` §6 |
| 3 | Editable routine vs. fixed Mon/Wed/Fri | Weekday template as default over date-based scheduling | This file, FR-3.4 |
| 4 | `ProgressionRecommendation` holding the user's decision vs. `ExerciseSession` holding recommended and selected weight | One frozen recommendation value inside the exercise session; no parallel record | `data-model.md` §4 |
| 5 | "No invented science" vs. required bibliography | Every source resolved by DOI, with access date; unverifiable claims marked as design decisions | `training-science.md` §1, §11 |
| 6 | Watch as data channel vs. HealthKit as data channel | HealthKit is not inter-app transport; the watch talks to the phone over `WatchConnectivity` | `architecture.md` §8 |

## 8. Decisions D-1…D-9 (gate G1, closed 2026-11-08)

The owner reviewed these against `training-science.md` at the F1 gate. Status is
recorded here in writing because `roadmap.md` §7 requires it.

| # | Decision | Accepted default | Status | Reversible until |
| --- | --- | --- | --- | --- |
| D-1 | HealthKit direction in MVP | read only; no write types requested (FR-14.3) | Accepted | end of F7 |
| D-2 | Effort capture | 4-button RIR proxy, optional to answer | Accepted with corrections (§8.1) | end of F3 |
| D-3 | Readaptation length | 4 weeks + gate extension, cap 8; gate evaluated per weekly block | Accepted with corrections (§8.1) | closed at G1 |
| D-4 | Watch app | P1; only the versioned contract exists in the MVP | Accepted | end of F4 |
| D-5 | Units | metric storage, imperial display optional | Accepted | end of F4 |
| D-6 | Deployment target | iOS 17.0 deployment target; SDK and simulator runtime recorded in `docs/environment.md` | Accepted with clarification (§8.1) | closed at F0 |
| D-7 | Xcode project generation | `project.yml` via XcodeGen, generated project not committed | Accepted | end of F0 |
| D-8 | Difficulty vocabulary | `fácil`/`correcto`/`duro`/`fallo` | Accepted | end of F5 |
| D-9 | Document language | English documents, Spanish UI copy | Accepted | any time |

### 8.1 What G1 corrected

Three defaults needed correction because each contradicted another document, and
one needed a clarification. The changes are applied in place, not left as
footnotes:

1. **D-2 — hard sets.** `training-science.md` §4 defined a hard set as 0–3 RIR while
   `data-model.md` counted 0–1 RIR, and the four-button scale cannot tell 3 RIR
   from 8. A hard set is now **≤2 RIR** (`correcto`, `duro`, `fallo`); `fácil` is
   excluded, so the count undercounts volume rather than inflating it.
2. **D-2 — gate effort.** The readaptation gate compared RIR numbers in the wrong
   direction (`effort ≤ target RIR` admits `fallo`), and an unanswered effort had
   no defined effect although effort is optional. The gate now compares **buckets**
   (`training-science.md` §6): blocks 1–2 accept only `fácil`, blocks 3–4 accept
   `fácil` or `correcto`; unanswered effort fails criterion 2 and the summary asks
   for it once per set (FR-7.4), never guessing a value.
3. **D-3 — gate window.** The gate was required "across two consecutive weeks",
   which makes the minimum phase eight weeks and the cap of eight unreachable as an
   extension, contradicting FR-4.2/FR-4.5 and the four weekly blocks. The gate is
   evaluated **within the block's own week**; the phase is 4 weeks minimum and 8
   maximum, and a block 4 that passes in week 8 still exits to the normal phase.
4. **D-6 — floor and value.** SwiftData sets the floor at iOS 17.0 and Xcode 15.2
   supplies the iOS 17 SDK, so the deployment target is **iOS 17.0**; the simulator
   runtime is recorded in `docs/environment.md` at F0. The owner's iPhone must run
   iOS 17 or newer.

`engineVersion` moves to `1.1.0` for the gate change (`progression-engine.md` §12).

## 9. Glossary

- **RIR** — repetitions in reserve: how many more reps could have been completed.
- **Double progression** — increase reps at a fixed load to the top of a range,
  then increase load and reset to the bottom of the range.
- **Readaptation phase** — the initial reintroduction block, not a warm-up.
- **Primary lift** — the day's main barbell movement; UI emphasis only.
- **Frozen recommendation** — the recommendation value stored with the session,
  never recomputed from later data.
- **Partial session** — a session ended with sets prescribed but not performed.
