# Rupfit — Roadmap

Status: F0 closed on 2026-11-08 (local gates and CI green, `docs/environment.md`);
F1 documents are closed at gate G1; next is F2, the design owner gate. Read this
with `docs/product-requirements.md`; every requirement ID referenced here exists
there.

---

## 1. How this document is used

- Phases are sequential. A phase starts only when the previous **gate** is green.
- A gate is a thing that can be observed, not a feeling. "The engine test suite
  passes" is a gate; "the engine works" is not.
- Work is committed in reviewable units of roughly 400 changed lines, with tests and
  documentation in the same unit as the behaviour, on a feature branch.
- Anything not listed here is not being built. New scope enters by editing
  `product-requirements.md` first.

## 2. Definition of Done (applies to every phase)

1. The deliverables exist and are linked from this document.
2. The phase's automated tests pass locally **and** in CI.
3. No document claims more than the tests prove; nothing is described as working
   that has not been run.
4. The diff has been read end to end before the phase is called closed.
5. Documentation updated in the same commit as the behaviour it describes.

---

## 3. Phases

### F0 — Environment and skeleton

**Purpose:** turn a documentation-only repository into one that builds and is
verified by a machine, on the Mac.

Deliverables:

- `Package.swift` with an empty-but-real `RupfitCore` target and one passing test.
- `App/project.yml` (XcodeGen) generating an app that launches to an empty view.
- `docs/environment.md` recording the **verified** versions: macOS, Xcode,
  `swift --version`, simulator runtime, XcodeGen. This is where D-6 (deployment
  target) is decided, against what is actually installed, not from memory.
- `.github/workflows/ci.yml` with the three jobs of `architecture.md` §11.
- Repository hygiene: `gh auth`, remote configured, branch protection optional.

Exit gate:

- `swift test` green locally.
- `xcodebuild test -scheme Rupfit -destination 'platform=iOS Simulator,name=iPhone 16'`
  (or the actual installed device name) green locally.
- Both green in CI on a pushed branch.
- `docs/environment.md` exists with real version output pasted in.

**Closed 2026-11-08.** Xcode 15.2 / Swift 5.9.2, iOS 17.2 simulator, XcodeGen
2.44.1; `swift test` and the simulator test green locally, and CI run 42477138093
green on branch `f0-bootstrap`. Deviations from the text above, recorded rather
than smoothed over: the simulator is an iPhone 15 (iOS 17.2), not an iPhone 16, and
the CI macOS job uses Xcode 16 in Swift 5 language mode because GitHub no longer
offers Ventura images.

**Blocker note:** this is the phase that cannot happen on Windows. Everything after
F1 is written against a toolchain that can reject it.

### F1 — Documents and science

**Purpose:** the specification the rest of the work is reviewed against.

Deliverables: the seven documents in `docs/` (this one included), plus optionally
`tools/check-citations.sh` — a script that re-resolves every DOI in
`training-science.md` through Crossref and fails on a mismatch. SHOULD, because it
converts "I verified the citations once" into "the citations are verified today".

Exit gate:

- Owner review of `product-requirements.md` and `training-science.md`: no
  requirement contradicts another, and no training rule is unexplained.
- Every DOI resolves (manual check or the script).
- Decisions D-1 … D-9 are either accepted or overridden in writing — done
  2026-11-08, `product-requirements.md` §8.

### F2 — Product design (owner gate)

**Purpose:** see the training experience before any of it is coded.

Deliverables (artboards, `design/<slug>/`, opened on the design canvas):

1. Training screen — exercise card, decision bar, set row, rest bar.
2. Session summary.
3. Home with and without history.
4. Progress with a single data point and with twelve weeks of data.
5. Perfil → Apple Health permission explanation.
6. States: first time (no data), resumed session, HealthKit empty, error banner.

Exit gate:

- **Owner approval of the training screen** — this is the one design review that
  must not be skipped, because it is the screen used while out of breath.
- Every screen in `design-system.md` §7 has its empty state drawn.

### F3 — Domain and engine (the highest-value phase)

**Purpose:** the logic that must be right, written before any UI can hide a mistake.

Deliverables:

- `RupfitCore/Domain`: the types of `data-model.md` §2–§3 with their invariants.
- `RupfitCore/Engine`: `recommend(_:)`, `evaluateBlock(...)`, rounding, reason codes.
- `RupfitCore/Statistics`: volume, hard sets, e1RM, records, weekly aggregates.
- Test suites: scenario table T-01…T-35, property tests P-1…P-8, plus statistics
  fixtures.

Exit gate:

- All scenario and property tests green, including the four worked examples of
  `progression-engine.md` §9.
- A mutation check: deliberately breaking rule order (e.g. moving discomfort below
  top-of-range) must fail at least three tests. If it does not, the suite is
  decorative.
- No `import SwiftUI|SwiftData|HealthKit` in `RupfitCore` (enforced by CI).

### F4 — Persistence, recovery, statistics wiring

**Purpose:** make the engine's answers durable and the session crash-proof.

Deliverables:

- `SchemaV1` entities, migration plan, bidirectional mappers.
- `SessionRepository` with per-set transactions; at most one `inProgress` session.
- Resume/partial-finish flow at the data level, plus the rest-timer derivation from
  `confirmedAt`.
- Backup export/import with full validation.

Exit gate:

- Mapper round-trip tests both directions for every entity.
- Kill/restore test: confirm 2 of 4 sets, tear down the container, reload, and the
  session resumes at set 3 with the correct remaining rest time.
- Import of an invalid document changes nothing (assert the store is byte-identical
  where comparable, and row-count-identical regardless).
- Migration test proving an empty stage list still opens a store written by v1.

### F5 — SwiftUI shell and the training screen (owner gate)

**Purpose:** the experience the product is judged on.

Deliverables:

- Navigation (`Inicio`, `Entrenar`, `Progreso`, `Perfil`) with the states of
  `design-system.md` §7.
- Exercise card paging (swipe + chevrons), decision bar, set rows, rest bar.
- Session summary; history read-out.
- Design tokens and components from `design-system.md` §3–§6, with preview matrix.

Exit gate:

- XCUITest smoke: start session → decide load → confirm two sets → finish → summary
  shows 2 sets and a volume figure derived from the fixtures.
- Accessibility audit on device/simulator: VoiceOver labels on decision bar, set
  row and paging; Dynamic Type XXL without clipping.
- **Owner review in a real gym** — the only gate that cannot be automated.
- No screen has a missing empty state.

### F6 — Progress, body weight, measurements

Deliverables: per-exercise charts, PR list, weekly volume per muscle, body-weight
series with 7-day mean and goal, measurement storage (UI for the extra measures is
P1).

Exit gate:

- Chart fixtures with 0, 1, 3 and 40 data points render without a misleading line.
- Every estimated value is labelled and dashed.
- Body-weight mean suppresses itself below 3 samples in the window.

### F7 — Apple Health (read only)

Deliverables: `HealthProviding` adapter, permission onboarding per type with a
plain-language purpose, provenance carried to the UI, recovery advisory line.

Exit gate:

- With all permissions refused, every MVP flow still works and no screen claims
  "denied" (only "no data").
- With permissions granted and the Health app seeded in the simulator, body weight,
  workouts and steps appear with `healthKit` provenance.
- Manual device checklist recorded in `docs/environment.md` §HealthKit.
- No write type is requested anywhere in the entitlements or Info.plist.

### F8 — watchOS companion (P1)

Only after F7 is closed. Deliverables: watch app, `WCSession` transport per
`architecture.md` §8, message codec tests, idempotent `logSet`.

Exit gate: protocol tests on both sides, plus a device session logged from the watch
appearing exactly once on the phone.

---

## 4. Test matrix

| Phase | Unit (no simulator) | Integration (simulator) | Manual on device |
| --- | --- | --- | --- |
| F0 | trivial | app launches | — |
| F1 | — | — | owner document review |
| F2 | — | — | owner design review |
| F3 | T-01…T-35, P-1…P-8, statistics fixtures, mutation check | — | — |
| F4 | mapper round-trips, import validation | kill/restore, migration | — |
| F5 | — | XCUITest smoke, preview matrix | gym review, accessibility |
| F6 | chart fixtures, mean suppression | rendering at 0/1/3/40 points | — |
| F7 | `FakeHealthProvider` states | seeded Health data | permission checklist |
| F8 | message codec, idempotency | — | watch → phone logging |

---

## 5. Work-unit and commit policy

- Branch per phase (`f3-engine`), merged to `main` when the gate is green.
- A work unit is one behaviour change with its tests and docs; target ~400 changed
  lines. A larger unit is split, not committed whole.
- Conventional Commits (`feat(core): …`, `test(engine): …`, `docs: …`).
- A unit whose risk assessment names a high-risk item (stored data, security,
  contracts, concurrency, delivery) gets its own commit so it can be reviewed alone.
- No commit claims a behaviour that its own tests do not demonstrate.

---

## 6. Environment checklist for the Mac (F0, run in this order)

```bash
xcodebuild -version            # must report 15.2 on this Mac: last Xcode for Ventura
swift --version
xcrun simctl list runtimes     # iOS 17.2 (21C62) after xcodebuild -downloadPlatform iOS
# XcodeGen: brew's formula needs Xcode 15.3, which Ventura cannot run. Use the
# 2.44.1 release zip and run its install.sh so share/xcodegen/SettingPresets exists.
gh auth login
git clone <remote> rupfit && cd rupfit
swift test -Xswiftc -strict-concurrency=complete -Xswiftc -warnings-as-errors
xcodegen generate --spec App/project.yml
```

Then paste the real outputs into `docs/environment.md`. Xcode 15.2 is the newest
this Mac supports, so on 2026-11-08 the owner chose Swift 5 language mode with
`-strict-concurrency=complete` and XCTest over CI-only builds
(`docs/environment.md` §3). Swift 6 language mode returns only with a build machine
that can run Xcode 16.

---

## 7. Owner gates and what is being decided

| Gate | Phase | Decision the owner makes |
| --- | --- | --- |
| G1 | after F1 | Requirements and training rules accepted or corrected — **closed 2026-11-08**, see `product-requirements.md` §8 |
| G2 | after F2 | Training screen design approved |
| G3 | during F5 | The session flow is usable in a real gym |
| G4 | after F7 | HealthKit read scope is what they want |

Nothing is built on top of an unapproved gate.

---

## 8. Risk register

| Risk | Trigger to act | Response |
| --- | --- | --- |
| No usable Xcode on the Mac | F0 gate fails | Stop; decide between upgrading Xcode or CI-only verification. Do not write Swift blind |
| HealthKit behaviour differs from documented | F7 checklist contradicts `architecture.md` §7.2 | Update the document and the states; never claim denial |
| Session flow rejected at G3 | owner cannot log a set quickly | Redesign before F6; do not proceed on top of an unusable screen |
| Engine scenarios insufficient | a real session produces a surprising recommendation | Add the scenario as a regression test first, then change the rule and the science table |
| Review workload explodes | a unit exceeds ~400 lines | Split it; the phase does not close |
| Scope creep from "nice" features | any request outside `product-requirements.md` | Add to the document as `P1`/`OUT` before any code |

---

## 9. Not planned

Backend, accounts, sync between devices, social features, subscriptions, running and
cycling analytics, nutrition tracking, medical or injury screening, AI-generated
coaching text. Recorded so that their absence is a decision, not an oversight.
