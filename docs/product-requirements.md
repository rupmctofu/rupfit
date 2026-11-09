# Rupfit — Product Requirements

Status: draft for approval. No requirement here is implemented.
Source: the product brief supplied by the owner (Spanish, 18 sections). Where a
requirement quotes UI copy or a rule verbatim, the Spanish string is preserved
because it is the actual interface text.

Platform: an offline-first PWA installed from Safari to the Home Screen on the
owner's iPhone 14 Pro (iOS 17/18, WebKit only), built and tested on Windows (spec
S2). Requirements written for the dropped native iOS plan are not deleted: they are
downgraded or marked `OUT` with the reason, so the decision is on the record.

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
- **MUST NOT** send health or training data to any external service, including any
  LLM, whether the data was entered by hand or imported through the optional
  Apple Health bridge (FR-14).

## 3. User and usage context

| Attribute | Value |
| --- | --- |
| Device | iPhone 14 Pro (393 × 852 CSS px), primary, in the gym |
| Platform | iOS 17/18, Safari / WebKit only. Installed to the Home Screen as a standalone PWA (spec S2; see §3.1) |
| Excluded platforms | Android, other browsers, desktop browsers, Apple Watch (FR-15). Development happens on Windows; no step of the plan requires macOS |
| Training history | ~12 months without strength training; returning progressively |
| Frequency | 3 strength sessions/week (Mon/Wed/Fri) + 1 intense cardio session (Thu) |
| Goals (in priority order) | general strength, physical condition and metabolic health, body-fat reduction, maintain/gain lean mass, body composition, long-term sustainability |
| Session environment | gym, one hand free, dim light, sweaty fingers, between 45 and 75 minutes |
| Constraint | no text entry during a session; every interaction must be a tap on a large target |

Goals are priorities, not mutually exclusive targets. The product never promises
an outcome; it organises training and surfaces progress.

### 3.1 What "installed" means

The app is not distributed through an app store and has no bundle, no signature and
no developer account (S1). Installation is Safari's `Añadir a pantalla de inicio`
over HTTPS. Installed, the app launches from the Home Screen with its own icon and
name and no browser chrome. Nothing expires and no re-installation cycle exists.

Consequences the requirements below depend on:

- **Offline is the normal operation, not a degraded one.** The app shell is served
  from the service worker cache and every read and write is served from IndexedDB
  with no network round trip (S3). Cold start from the cached shell is the measured
  path; the first load after installation is a network fetch and is not held to the
  same budget.
- **Storage is not permanent.** Safari applies a seven-day cap to script-writable
  storage for sites that were *not* added to the Home Screen, and an installed web
  app is exempt from that cap; the exemption is not a guarantee of permanence.
  WebKit does not implement `navigator.storage.persist()`, so the app cannot ask to
  be made persistent. The export of FR-16.3 is therefore the only durable copy and
  the UI must treat it as such.
- **No background execution, no background sync and no reliable timers.** Anything
  that has to be true later is stored as a timestamp and recomputed on return
  (FR-8.4), never accumulated in memory.
- **No HealthKit and no native watch companion.** See FR-14 and FR-15.

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
- **FR-2.4 MUST NOT** ship images as a blocker for v1; exercise illustration is
  `P1` (see `docs/design-system.md` for the placeholder rule).
- **FR-2.5 MUST** keep historical sessions intact when an exercise is renamed,
  archived or deleted (see `docs/data-model.md` invariant I-4).

### FR-3 Routine and schedule — MVP

- **FR-3.1 MUST** ship the owner's three gym days. Superseded on 2026-11-09 by
  `odd/tasks/training-program.md` (his own training needs, not a template for others):

  | Day | Name | Strength lift | Football |
  | --- | --- | --- | --- |
  | Monday | `PIERNA` | Sentadilla trasera (+ peso muerto rumano) | — |
  | Tuesday | `TORSO A` | Press banca | — |
  | Thursday | — | — | Match, ~50 min, recorded as an activity |
  | Friday | `TORSO B` | Press banca inclinado | — |

  Rupfit stores no weekday (`data-model.md §3`), so the three days are a rotation and the
  calendar lives with the owner. Football is an `ActivityRecord`, never a session, and it
  never moves the rotation. Wednesday, Saturday and Sunday are rest because only three gym
  days exist.

- **FR-3.2 MUST** ship these accessories per day, editable and reorderable, each with its
  own prescription profile (`progression-engine.md §8`):
  *Pierna* — prensa (hypertrophy), curl femoral sentado (accessory), nordic curl asistido
  (preventive), copenhagen plank adaptado (preventive), elevación de gemelos de pie y
  elevación de sóleo sentado (accessory); *Torso A* — remo con barra, jalón al pecho,
  press de hombro (hypertrophy), elevaciones laterales, curl de bíceps con barra,
  extensiones de tríceps (accessory); *Torso B* — remo en máquina, dominadas asistidas,
  press de hombro en máquina (hypertrophy), face pull, curl en polea, extensión de tríceps
  sobre la cabeza (accessory). The full version of the Nordic curl and of the Copenhagen
  plank ship in the library but never in the starting plan: S3 asks for a prudent
  introduction, so they enter as a change of exercise the owner makes, not as load the
  engine adds.
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
  calendar: complete all target reps, perceived effort at or below the target RIR,
  no reported discomfort, and at least 2 of 3 sessions attended, sustained across
  two consecutive weeks.
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
- **FR-8.2 MUST** notify the end of rest with a persistent on-screen state that
  remains until the next set starts or the user dismisses it, and **MUST NOT**
  depend on a notification permission. *Downgraded from haptic + sound:* iOS WebKit
  has no haptic API (`navigator.vibrate` is not implemented) and audio is muted by
  the ringer switch and suspended while the app is backgrounded, so both are
  optional additions and neither may be the only signal. See
  `docs/design-system.md` §6.3.
- **FR-8.3 MUST** allow skip and extend (`+15 s`, `+30 s`) with a single tap each.
- **FR-8.4 MUST** remain accurate across backgrounding, screen lock and app
  relaunch. The remaining time is derived from the confirmation timestamp, never
  accumulated by a running timer, because WebKit throttles and suspends page timers
  when the app is not visible.

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

- **FR-12.1 MUST** record body weight manually, and **MUST** treat manual entry as
  the only body-weight source in the MVP. *Downgraded from "manually and from Apple
  Health":* a web page cannot read HealthKit (FR-14). An optional import through the
  iOS Shortcuts bridge is `P1`, arrives through the normal import path of FR-16.3
  and never becomes a required input (S4).
- **FR-12.2 MUST** show a daily series, a 7-day rolling mean as the headline
  metric, and period comparisons.
- **FR-12.3 MUST** support an optional body-weight goal without framing the
  rolling mean as a target that must be hit.
- **FR-12.4 MUST NOT** use BMI as the primary or sole health indicator.
- **FR-12.5 MUST** store and export measurement types for waist, chest, arm,
  thigh, hip and body-fat percentage; the UI for them is `P1`.
- **FR-12.6 MUST** allow comparing body-weight trend with squat, deadlift and
  bench progression.

### FR-13 Cardio and general activity — P1 (imported or manual)

No requirement in FR-13 is an MVP input, and none of it may block training (S4).
Cardio and recovery data are context that the user may choose to bring in; the
session works identically without them.

- **FR-13.1** *Downgraded from `MVP` to `P1`, and from "read from Apple Health" to
  "imported".* **SHOULD** show weekly activity and intense-cardio days from cardio
  workouts that arrive through the optional Shortcuts bridge (FR-14). In the MVP
  the app shows no cardio data and says so once, without an error state.
- **FR-13.2** *Downgraded to context that exists only when data was imported.*
  **SHOULD** show recovery context (yesterday's intense session, elevated resting
  heart rate, poor sleep) as an explained warning only. Sleep, HRV and resting heart
  rate are never required inputs, are never a gate for anything, and never enter the
  load calculation (`docs/progression-engine.md` §2).
- **FR-13.3 MUST NOT** change a strength load automatically because of cardio;
  the recommendation is unaffected and the user decides.
- **FR-13.4 MUST** distinguish imported data from manually entered data and from
  estimated data in the UI and in storage. *Reinterpreted:* the third source is no
  longer an Apple Health sample read by the app, it is a record whose provenance is
  the bridge document described in FR-14.
- **FR-13.5 SHOULD** allow manual entry of an unsynced activity. This is the only
  route to activity data without an import, so it is `P1` rather than polish.

### FR-14 Apple Health — OUT (explicitly rejected for the MVP)

Apple Health is recorded here as a rejected dependency rather than deleted: a
requirement that disappears without a reason comes back. **A web page cannot read
HealthKit.** The only iOS API for it is a native framework, and the PWA has no
native container, no entitlement and no code signature that could ship one (S2, S4).

- **FR-14.1** `OUT`. *Was:* request per-type read permission with a plain-language
  purpose. There is no permission to request; HealthKit never appears in the app.
- **FR-14.2** `OUT`. *Was:* distinguish unavailable, undetermined and revoked
  access, and never claim a read permission was denied. The distinction only exists
  for a native HealthKit client, so no such state, prompt or copy exists in the
  product. What replaces it is the honest empty state for imported data (FR-13.1).
- **FR-14.3** `OUT`. *Was:* never write to HealthKit in the MVP. Nothing can write
  to HealthKit from the app at all.
- **FR-14.4** *Kept in substance.* The app functions fully with no health data of
  any kind, which in the MVP is the only possible state (acceptance criterion 8).
- **FR-14.5** `OUT`. *Was:* request nothing during a workout session. Nothing is
  ever requested, because there is nothing to request.

**Optional later bridge (`P1`, no requirement implied).** iOS Shortcuts can read
Apple Health on the owner's behalf and produce a JSON document, which the user
imports through the normal import path of FR-16.3. The app performs no health read
itself; it only validates and imports a document, so imported records are
attributable to the bridge in storage (FR-16.5) and never become required fields in
the domain model. If the bridge is never built, nothing in the product changes.

### FR-15 Apple Watch — OUT (explicitly rejected)

The watch was a `P1` companion with a contract defined in the MVP. It is now out of
scope with the platform, not postponed: **a watchOS app cannot talk to a web page.**
There is no `WatchConnectivity` counterpart in a PWA, no way to install or mirror a
Home Screen web app onto the watch, and no complication or watch notification that
a browser can drive. Keeping a message schema for a device that cannot exchange
messages would be documentation of a fiction (S8).

- **FR-15.1** `OUT`. *Was:* keep the versioned `WatchConnectivity` message schema
  from the start, with the iPhone as the source of truth. There is no transport, so
  there is no schema. The iPhone (the PWA) remains the only source of truth.
- **FR-15.2 MUST NOT** ship a watch app in the MVP. *Kept, and no longer a phase
  boundary:* no watch app exists at any phase of this plan.
- **FR-15.3** `OUT`. *Was:* planned `P1` — view today's session, current exercise,
  sets and reps, log a set, rest countdown, haptic alerts. All five depend on a
  native watch app; the rest timer's missing haptics are handled in the phone UI
  instead (FR-8.2).
- The accepted cost, recorded: no wrist control of a session and no wrist alert when
  rest ends. The phone is the only surface, and it must be reachable for every
  interaction.

### FR-16 Privacy and data handling — MVP

- **FR-16.1 MUST** store all data locally in the browser's IndexedDB on the
  device; there is no server and no account.
- **FR-16.2 MUST NOT** transmit health or training data off-device. There is no
  network code path in the app after the shell has been installed.
- **FR-16.3 MUST** export the full dataset as a documented JSON document on demand
  (user-owned backup), and import it back. *Platform consequence:* the export is the
  only copy that survives storage eviction, a cleared Safari website data store, or
  a new phone, so it must be reachable from `Perfil` in two taps, must state when
  the last export happened, and the import must validate the whole document before
  replacing anything (no partial import, no silent merge). Any state that loses the
  local data must present the import as the recovery action rather than a fresh
  first run.
- **FR-16.4 MUST** delete everything on request with no partial residue.
- **FR-16.5 MUST** keep imported health data read-only and attributable to its
  source (the bridge document of FR-14) and never edit it in place.

## 5. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Fully offline. Cold launch to interactive in under 1.5 s on iPhone 12 or newer, served from the service worker cache with no network round trip. The first load after installation is a network fetch and is measured separately. |
| NFR-2 | Confirming a set and seeing the next state: under 100 ms perceived, no spinner, no network. |
| NFR-3 | No crash, force-quit, page reload or screen lock may lose a confirmed set. Persist-before-confirm. |
| NFR-4 | The iOS text-size setting and page zoom up to 200 % without clipping, accessible names on every control (ARIA, not glyph-only buttons), 48 × 48 CSS px minimum target, WCAG AA contrast in both themes. Pinch zoom is never disabled. *Raised from the 44 pt platform minimum:* sweat, chalk and cold hands cost accuracy, and a missed tap mid-set has a real cost (`docs/design-system.md` §3). |
| NFR-5 | TypeScript with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; the domain types are immutable values; the progression engine is pure functions over plain data with no I/O, no DOM, no storage and no clock (S6). |
| NFR-6 | UI copy in Spanish (owner's language); code, tests, comments and these documents in English. |
| NFR-7 | Metric units canonical in storage; imperial is display-only, configurable. |
| NFR-8 | **Closed runtime dependency list (owner decision).** Rupfit ships exactly `react`, `react-dom`, `idb` and `zod` as runtime dependencies, enumerated in `docs/architecture.md` §3.3. No CSS framework, no charting library (charts are hand-written SVG, ADR-006), no state-management library, no meta-framework, no web fonts, no analytics, and no runtime network dependency. Adding one of anything requires an ADR and an owner gate. *Owner decision that amends the original "zero third-party runtime dependencies" requirement:* a UI framework, an IndexedDB wrapper and a validator are on the list deliberately, the list is closed, and `docs/architecture.md` §13 makes CI compare `package.json` against it. |
| NFR-9 | Accessibility: no gesture-only action; Reduce Motion honoured; colour never the sole carrier of meaning; no interaction that depends on haptics. |

## 6. Acceptance criteria for the MVP

The MVP is accepted when all of the following hold on the owner's iPhone 14 Pro, in
the installed Home Screen app:

1. A fresh install (Safari `Añadir a pantalla de inicio`) launches with no browser
   chrome and reaches the readaptation week-1 prescription without an account.
2. For each of the six seeded exercises of the Monday template, the app shows the
   previous session's weight, a recommended weight, and a one-line reason, or an
   explicit "no data yet" state.
3. Accepting, repeating and overriding a weight each produce a stored
   `LoadDecision` with the delta between recommended and used weight.
4. A full session can be logged with two taps per set, and force-quitting the app
   after set 2 of 4 restores exactly that position on relaunch.
5. The summary reports duration, sets completed vs prescribed, total volume and
   any PR — with every number traceable to stored set records.
6. History shows that same session with the recommendation it displayed at the
   time (not a recomputed one).
7. Progress shows at least one per-exercise progression chart and a body-weight
   rolling mean.
8. With no health data of any kind — the only possible state in the MVP — every
   flow still works, and no screen presents sleep, HRV, resting heart rate, Apple
   Health access or an Apple Watch as a required input.
9. The engine test suite listed in `docs/progression-engine.md` §8 passes.
10. With the network unavailable and the app already installed, a cold launch loads
    the shell, shows the last session and logs a set with no error state (NFR-1,
    NFR-2, S3).
11. After the rest timer has been started and the app has been backgrounded or the
    screen locked for longer than the rest, returning shows the rest as finished
    and the elapsed time, not a frozen countdown (FR-8.4).
12. Exporting from a populated install, clearing the site's data in Safari settings
    and importing the document on a fresh install reproduces every session, set and
    frozen recommendation, and the evicted state offers the import as the first
    action (FR-16.3).

## 7. Resolved contradictions (decisions and where they live)

| # | Tension in the brief | Resolution | Document |
| --- | --- | --- | --- |
| 1 | Deterministic engine (§5) vs. recovery context (§5, §7) | Recovery never enters the load calculation; it is presentation-only context | `progression-engine.md` §2 |
| 2 | Readaptation "adjusted to real evolution" without criteria | Explicit gate criteria plus a hard cap | `training-science.md` §6 |
| 3 | Editable routine vs. fixed Mon/Wed/Fri | Weekday template as default over date-based scheduling | This file, FR-3.4 |
| 4 | `ProgressionRecommendation` holding the user's decision vs. `ExerciseSession` holding recommended and selected weight | One frozen recommendation value inside the exercise session; no parallel record | `data-model.md` §4 |
| 5 | "No invented science" vs. required bibliography | Every source resolved by DOI, with access date; unverifiable claims marked as design decisions | `training-science.md` §1, §11 |
| 6 | Watch as data channel vs. HealthKit as data channel | Both channels are out. HealthKit is unreachable from a web page and a watchOS app cannot exchange messages with a PWA; the only remaining external input is a Shortcuts-authored import document that travels through the normal import path | Health and watch sections of `architecture.md`; this file FR-14, FR-15 |
| 7 | Native iOS shell vs. zero recurring cost and no re-signing | The PWA wins: installable from Safari, standalone, developed on Windows, nothing expires. Cost accepted: no haptics, no HealthKit, no watch companion, no background execution, storage that can be evicted | `architecture.md`, `design-system.md` §2 |
| 8 | "Zero third-party runtime dependencies" vs. React, `idb` and `zod` on the stack | **Owner decision:** the requirement is amended, not reinterpreted. NFR-8 now ships a closed runtime list of exactly `react`, `react-dom`, `idb`, `zod`; nothing else may be added without an ADR and an owner gate | This file, NFR-8; `architecture.md` §3.3 |

## 8. Open decisions and the default applied

Unless the owner overrides, these defaults are in force:

| # | Decision | Default | Reversible until |
| --- | --- | --- | --- |
| D-1 | HealthKit direction in MVP | **Closed: out (S4).** No health read exists in the product. An optional Shortcuts import is `P1` and is not a dependency of any MVP flow | closed |
| D-2 | Effort capture | 4-button RIR proxy, optional | end of F3 |
| D-3 | Readaptation length | 4 weeks + gate extension, cap 8 | end of F1 |
| D-4 | Watch app | **Closed: out.** A watchOS app cannot talk to a PWA (FR-15). Not a `P1` and not a phase | closed |
| D-5 | Units | metric storage, imperial display optional | end of F4 |
| D-6 | Deployment target | **Replaced:** iOS 17/18 Safari on the owner's iPhone 14 Pro, WebKit only. There is no Xcode and no macOS step; the target is a browser version, not a build setting | closed (S2) |
| D-7 | Xcode project generation | **Removed:** there is no project to generate. The web build toolchain is decided in `docs/roadmap.md` F0 and recorded with real versions in `docs/environment.md` | closed (S2) |
| D-8 | Difficulty vocabulary | `fácil`/`correcto`/`duro`/`fallo` | end of F5 |
| D-9 | Document language | English documents, Spanish UI copy | any time |

## 9. Glossary

- **RIR** — repetitions in reserve: how many more reps could have been completed.
- **Double progression** — increase reps at a fixed load to the top of a range,
  then increase load and reset to the bottom of the range.
- **Readaptation phase** — the initial reintroduction block, not a warm-up.
- **Primary lift** — the day's main barbell movement; UI emphasis only.
- **Frozen recommendation** — the recommendation value stored with the session,
  never recomputed from later data.
- **Partial session** — a session ended with sets prescribed but not performed.
- **Installed** — added to the Home Screen from Safari over HTTPS, launching
  standalone with its own icon and no browser chrome. There is no app store, no
  signature and nothing that expires (§3.1).
- **Evicted storage** — the browser has discarded the site's IndexedDB, so the local
  data is gone and the last export is the only copy. The UI treats this as a state
  with a recovery action, not as a fresh install (FR-16.3).
- **Bridge** — the optional `P1` iOS Shortcuts flow that reads Apple Health outside
  the app and produces a JSON document for the normal import path. Not part of the
  MVP and never a required input (FR-14).
