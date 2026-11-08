# Rupfit

A native iOS strength-training coach for one person: it remembers what you lifted,
decides what you should attempt next, and gets out of the way while you train.

Not a social fitness app. No streaks, badges, leaderboards or feeds. Local-first,
offline-first, deterministic.

## Status

**F0 closed (2026-11-08).** The documentation is closed at gate G1, and F0's gates
are green: `swift test` and `xcodebuild test` on the iOS 17.2 simulator pass locally
on Xcode 15.2 / Swift 5.9.2, and CI passes on `f0-bootstrap`. The only Swift is the
package/app skeleton — no app behaviour exists yet. Next: F2, the design owner gate.
Recorded environment: `docs/environment.md`.

| Area | State |
| --- | --- |
| Product requirements | Done — `docs/product-requirements.md` |
| Training science and evidence | Done — `docs/training-science.md` (sources verified 2026-11-08) |
| Architecture | Done — `docs/architecture.md` |
| Data model | Done — `docs/data-model.md` |
| Progression engine specification | Done — `docs/progression-engine.md` |
| Design system | Done — `docs/design-system.md` |
| Roadmap and phase gates | Done — `docs/roadmap.md` |
| Swift sources, Xcode project, tests | F0 closed — package + app skeleton, local and CI green (`docs/environment.md`) |

## How it builds

The app is iOS-only: SwiftUI, SwiftData, HealthKit, WatchConnectivity. It builds on
the Mac with Xcode 15.2 / Swift 5.9.2, because that is the newest Xcode the machine
supports and the documents were amended accordingly (NFR-5, D-6;
`docs/environment.md` §3). The simulator is iOS 17.2.

`RupfitCore` is the one component that does not need the Mac: a pure-Swift package
with no UI, no SwiftData and no HealthKit imports. It holds the domain model and
the progression engine, so it compiles and tests on any Swift 5.9 toolchain — the
CI `core` job runs it on Linux.

## Read in this order

1. `docs/product-requirements.md` — what the product must do, what it must not do.
2. `docs/training-science.md` — the evidence behind every training rule.
3. `docs/architecture.md` — modules, dependency rules, platform decisions.
4. `docs/data-model.md` — domain types, persistence, migrations.
5. `docs/progression-engine.md` — the deterministic load engine and its tests.
6. `docs/design-system.md` — tokens, components, accessibility, gym constraints.
7. `docs/roadmap.md` — phases, gates, test matrix.

## Ground rules

- No claim of "implemented" without a test that fails when the behaviour breaks.
- No citation that does not resolve to a real record (see `docs/training-science.md`).
- No simulated data presented as real, no fake integrations.
- Training data is health data: it stays on the device.
