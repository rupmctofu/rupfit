# Rupfit — Architecture

Status: designed, not implemented. Nothing here has been compiled on a device yet:
the repository was initialised on Windows, the first build happens on macOS (F0).
This document states intent and the rules a reviewer can check; it makes no claim
that a target exists.

---

## 1. Design constraints

1. **One device, one user, no server.** Data lives in the app container.
2. **Offline is the only mode.** No network code path exists.
3. **The progression engine must be testable without a simulator.** It contains the
   only logic a wrong answer would be silent and damaging.
4. **Persistence must never be the model.** SwiftData is an implementation detail
   behind a boundary, so it can be replaced and so the engine never imports it.
5. **No third-party runtime dependencies.** No DI container, no networking layer,
   no charting library (`Swift Charts` is first-party).
6. **Swift 6 language mode, strict concurrency.** Domain types are `Sendable`.

---

## 2. Modules and dependency graph

```
                     ┌───────────────────────────┐
                     │          Rupfit           │   iOS app target
                     │  SwiftUI · features · DI  │   (composition root)
                     └───┬────────┬────────┬─────┘
                  ┌──────┘        │        └────────┐
        ┌─────────▼──────┐ ┌──────▼───────┐ ┌──────▼────────┐
        │ RupfitPersist. │ │ RupfitHealth │ │ RupfitWatch   │
        │ SwiftData      │ │ HealthKit    │ │ WCSession     │
        └─────────┬──────┘ └──────┬───────┘ └──────┬────────┘
                  └───────────────┴────────────────┘
                                  │
                        ┌─────────▼─────────┐
                        │    RupfitCore     │   Swift package, Foundation only
                        │ domain · engine   │   no UI, no SwiftData, no HealthKit
                        └───────────────────┘
```

**Dependency rule (enforced in review and by a CI grep):**

| Target | May import | Must never import |
| --- | --- | --- |
| `RupfitCore` | `Foundation` | `SwiftUI`, `SwiftData`, `HealthKit`, `WatchConnectivity`, `UIKit` |
| `RupfitPersistence` | `Foundation`, `SwiftData`, `RupfitCore` | `SwiftUI`, `HealthKit` |
| `RupfitHealth` | `Foundation`, `HealthKit`, `RupfitCore` | `SwiftUI`, `SwiftData` |
| `RupfitWatch` | `Foundation`, `WatchConnectivity`, `WatchKit`, `RupfitCore` | `SwiftUI` (app target owns views), `SwiftData` |
| `Rupfit` (app) | all of the above, `SwiftUI`, `Swift Charts` | — |

A feature folder may not import another feature folder. Shared UI lives in
`DesignSystem`; shared logic lives in `RupfitCore`.

**Why `RupfitCore` is a package and not a folder:** it must be buildable and
testable with `swift test` on any platform that has a Swift toolchain. That is the
only part of this product that can be verified without a Mac, and it holds the
logic that matters most.

---

## 3. Repository layout

```
Package.swift                  # RupfitCore target + tests (Swift 6)
Sources/RupfitCore/
  Domain/                      # entities, value types, invariants
  Engine/                      # ProgressionEngine, ReadaptationPolicy, LoadRounding
  Statistics/                  # volume, e1RM, records, weekly aggregates
  Ports/                       # Clock, UUIDProviding, protocol boundaries
Tests/RupfitCoreTests/         # pure unit tests, no simulator
App/
  project.yml                  # XcodeGen spec (see ADR-004)
  Rupfit/                      # app target
    App/                       # entry point, AppContainer (composition root)
    Features/Home|Train|Progress|Profile/
    DesignSystem/              # tokens + components (see design-system.md)
  RupfitPersistence/           # @Model entities, mappers, SchemaV1 + migration plan
  RupfitHealth/                # HealthKit adapter, fakes, permission state
  RupfitWatch/                 # WCSession transport + message codec
RupfitWatchApp/                # watch app target (F8, not created in MVP)
docs/
```

The `.xcodeproj` is **not** committed; it is generated from `App/project.yml`.
Rationale in ADR-004.

---

## 4. Data flow

Unidirectional, one direction only:

```
View (SwiftUI, stateless rendering)
  └─ FeatureModel (@MainActor @Observable)  — session-scoped UI state
      └─ UseCase (struct, Core)             — one operation, no UI types
          ├─ RupfitCore                     — pure functions, deterministic
          └─ Port (protocol)                — repository / health / clock
              └─ Adapter (Persistence, Health, Watch)
```

Rules:

- A `View` never touches SwiftData, HealthKit or `WCSession`.
- A `FeatureModel` never contains training rules; it calls a use case.
- A use case never imports a framework beyond `Foundation` + `RupfitCore`.
- Adapters return **domain types**, never `@Model` or `HKQuantitySample`.

The engine is a pure function:

```swift
public func recommend(_ input: ProgressionInput) -> ProgressionRecommendation
```

Same input, same output, no clock, no I/O, no randomness. Time and identity are
injected (`Clock`, `UUIDProviding`) so tests can pin them.

---

## 5. Persistence

`RupfitPersistence` owns a single `ModelContainer` with `SchemaV1` and a
`RupfitMigrationPlan` registered from the first release, even while it has zero
stages. Adding the versioning machinery later is what turns a small change into a
data-loss incident; adding it now costs one file.

- Entities are `@Model` classes, flat and denormalised for query convenience.
- Mappers convert entity ↔ domain struct; mappers are unit-tested both directions.
- Writes for a confirmed set are awaited before the UI shows the set as done
  (NFR-3). If the write throws, the set stays unconfirmed and a retry banner
  appears; the app never reports success it did not persist.
- Bulk reads for statistics happen off the main actor through a `@ModelActor`
  context and return `Sendable` domain aggregates.

Details and invariants: `docs/data-model.md`.

---

## 6. Concurrency model

| Concern | Model |
| --- | --- |
| UI state | `@MainActor` observable feature models |
| Engine | pure `Sendable` structs, no actor needed, synchronous |
| Persistence | `@ModelActor` actor; no `ModelContext` crosses an actor boundary |
| HealthKit | `async` adapter methods returning domain values |
| Watch | `WCSessionDelegate` on its own queue, hop to `@MainActor` for state |

Swift 6 strict concurrency is on from the first commit. A warning is a build
failure in CI.

---

## 7. Apple HealthKit

### 7.1 What is requested (read only, MVP)

| Data | Type | Why the app asks |
| --- | --- | --- |
| Body mass | `bodyMass` | body-weight trend and weekly mean |
| Body fat percentage | `bodyFatPercentage` | composition context, optional |
| Workouts | `HKWorkout` | cardio history and weekly activity |
| Heart rate | `heartRate` | workout context only |
| Resting heart rate | `restingHeartRate` | recovery context (advisory only) |
| Steps | `stepCount` | daily activity |
| Active energy | `activeEnergyBurned` | daily activity |
| Sleep analysis | `sleepAnalysis` | recovery context (advisory only) |

Entitlement: `com.apple.developer.healthkit`. Info.plist keys:
`NSHealthShareUsageDescription` (required for read). `NSHealthUpdateUsageDescription`
is **not** added in the MVP, because the MVP does not write.

### 7.2 The permission contract that shapes the whole design

HealthKit deliberately does not disclose read authorization. Apple's documented
behaviour: if read access is not granted, the store simply returns **no data**, so
an app cannot distinguish "denied", "not determined" and "user has no samples".

Consequences, which are requirements:

1. The app **must never** display "permiso denegado" for a read type. It can only
   say "no hay datos disponibles".
2. `HKHealthStore.authorizationStatus(for:)` is meaningful for **write** types only.
   The MVP has no write types, so this call is not used at all.
3. `getRequestStatusForAuthorization` reports whether the *request sheet* still
   needs to be shown; it is a one-time onboarding signal, not a permission state.
4. Every dependent UI element must have an honest empty state, and every flow must
   work with zero health data (FR-14.4).

```swift
public enum HealthDataState<Value: Sendable>: Sendable {
    case available(Value, provenance: Provenance)   // .healthKit, .manual, .estimated
    case noData                                     // indistinguishable causes
    case notRequested
    case unavailable(HealthDataType)                // device cannot provide it
}
```

`Provenance` is carried all the way to the view so measured and estimated values
can never be visually confused (FR-13.4).

### 7.3 Adapter boundary

```swift
public protocol HealthProviding: Sendable {
    func bodyMass(since: Date) async -> HealthDataState<[Measurement]>
    func workouts(since: Date) async -> HealthDataState<[ActivityRecord]>
    func restingHeartRate(since: Date) async -> HealthDataState<[HeartRateSample]>
    func dailyActivity(since: Date) async -> HealthDataState<[ActivityBucket]>
    func sleep(since: Date) async -> HealthDataState<[SleepInterval]>
}
```

Tests use `FakeHealthProvider` with scripted states. There is no other way to test
permission behaviour; device behaviour is verified by a manual checklist (F7).

---

## 8. Apple Watch contract

HealthKit is not a channel between the phone app and a watch app: it holds samples,
not UI state. The watch talks to the phone over `WatchConnectivity`.

```swift
public struct WatchEnvelope: Codable, Sendable {
    public let schemaVersion: Int          // 1
    public let id: UUID                    // idempotency key
    public let sentAt: Date
    public let payload: Payload
}
```

| Message | Direction | Transport | Idempotency |
| --- | --- | --- | --- |
| `sessionSnapshot` | phone → watch | `updateApplicationContext` | last-writer-wins |
| `currentExercise` | phone → watch | `updateApplicationContext` | last-writer-wins |
| `restTimerState` | phone → watch | `sendMessage` (reachable) / context | monotonic by `sentAt` |
| `logSet` | watch → phone | `transferUserInfo` | deduplicated by `id` |
| `finishSet` / `skipRest` | watch → phone | `sendMessage` / `transferUserInfo` | deduplicated by `id` |

Rules: every inbound message is idempotent by `id`; an unknown `schemaVersion` is
ignored and logged, never guessed; the phone is the sole source of truth and the
watch holds no durable log of its own in v1. This file is written in F4 so the
watch app in F8 is an implementation, not a redesign.

---

## 9. Error model

```swift
public enum AppError: Error, Sendable {
    case persistence(PersistenceFailure)     // write/read/migration
    case health(HealthFailure)               // unavailable type, query failure
    case importFailed(ImportFailure)         // invalid backup document
    case watchUnreachable                    // no paired/reachable device
}
```

Degradation rules:

| Failure | Behaviour |
| --- | --- |
| Health data unavailable | Hide the widget; show the empty state; no error dialogue |
| Persistence write fails on confirm | Set stays unconfirmed, banner with retry, no silent loss |
| Migration fails | App opens read-only with an export action; it never deletes the store |
| Backup import invalid | Reject the whole document, report the reason, change nothing |

No failure may block starting a workout: recording a session must work even when
HealthKit, the watch and statistics are all unavailable.

---

## 10. Testing strategy

| Layer | Tool | Runs where | Automated |
| --- | --- | --- | --- |
| `RupfitCore` domain + engine | Swift Testing / XCTest | any Swift toolchain (CI Ubuntu) | yes |
| Mappers, migration | XCTest + in-memory `ModelContainer` | iOS simulator (CI macOS) | yes |
| Statistics | XCTest against fixed fixtures | CI Ubuntu (pure) | yes |
| Watch message codec | XCTest | CI Ubuntu (pure) | yes |
| Views | XCUITest smoke for the session flow | simulator (CI macOS) | partial, deliberately small |
| HealthKit permissions | manual checklist on device | device | no |
| HealthKit reads in simulator | manual checklist (Health app seeded) | simulator | no |

UI test coverage is limited on purpose: the irreversible risks live in the engine
and in persistence, and those are tested without a screen.

---

## 11. CI

```yaml
# intended shape, created in F0
jobs:
  core:    ubuntu-latest    swift test            # RupfitCore:
  ios:     macos-latest     xcodebuild test       # app + persistence, simulator
  lint:    ubuntu-latest    swift-format lint + import-rule grep + warning-as-error
```

The import-rule grep fails the build if `RupfitCore` imports a forbidden module, or
if a feature folder imports another feature folder. Rules that only live in a
document are rules that decay.

---

## 12. Architecture decision records

| ADR | Decision | Alternative rejected |
| --- | --- | --- |
| ADR-001 | `RupfitCore` is a framework-free Swift package | Engine inside the app target — untestable in CI |
| ADR-002 | Domain structs + SwiftData adapters with explicit mappers | Using `@Model` as the domain — couples the engine to persistence, blocks pure tests |
| ADR-003 | HealthKit read-only in the MVP | Writing workouts — duplicate samples, conflict handling, no user benefit yet |
| ADR-004 | `project.yml` via XcodeGen, generated project ignored | Hand-written `.xcodeproj` — unreviewable diffs, generated on a machine that cannot verify it |
| ADR-005 | The recommendation is frozen at session start | Recomputing from latest data — destroys the record of what was shown |
| ADR-006 | No third-party runtime dependencies | DI container / chart wrappers — supply-chain risk for no gain |
| ADR-007 | Recovery signals never enter the engine | Adaptive load from HRV/sleep — non-deterministic, untestable, forbidden by FR-13.3 |
| ADR-008 | Watch contract defined in MVP, watch app in P1 | Full watch app now — untestable without device capacity, delays the core |
| ADR-009 | Metric canonical storage, imperial display-only | Storing user units — rounding drift and migration pain |
| ADR-010 | Spanish UI copy, English code and documents | All-Spanish — code identifiers and review vocabulary in a second language |
| ADR-011 | Additive-only schema migration policy, versioned from v1 | Destructive reset — the store is the user's only training history |

---

## 13. Known risks

| Risk | Mitigation |
| --- | --- |
| No Mac in the initial environment | Core package is platform-independent; F0 blocks everything else |
| HealthKit cannot report read denial | Design allows only "no data" states; tested via fakes (§7.2) |
| SwiftData migrations are hard to reverse | SchemaV1 + plan from day one; export before migration; no destructive fixes |
| WatchConnectivity is unreliable in the simulator | Wire protocol unit-tested; device verification required in F8 |
| Review workload from a large first implementation | Phase gates and ~400-line work units (see roadmap) |
| Untested Swift written on a non-Mac host | Forbidden: no Swift source is written before F0 is green |
