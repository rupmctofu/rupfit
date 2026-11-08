# Rupfit

A native iOS strength-training coach for one person: it remembers what you lifted,
decides what you should attempt next, and gets out of the way while you train.

Not a social fitness app. No streaks, badges, leaderboards or feeds. Local-first,
offline-first, deterministic.

## Status

**F0 in progress, local gates green.** The documentation is closed at gate G1. On
this Mac (Xcode 15.2 / Swift 5.9.2) `swift test` and `xcodebuild test` on the iOS
17.2 simulator pass; CI on a pushed branch is the last open item. The only Swift is
the package/app skeleton — no app behaviour exists yet. Recorded environment:
`docs/environment.md`.

| Area | State |
| --- | --- |
| Product requirements | Done — `docs/product-requirements.md` |
| Training science and evidence | Done — `docs/training-science.md` (sources verified 2026-11-08) |
| Architecture | Done — `docs/architecture.md` |
| Data model | Done — `docs/data-model.md` |
| Progression engine specification | Done — `docs/progression-engine.md` |
| Design system | Done — `docs/design-system.md` |
| Roadmap and phase gates | Done — `docs/roadmap.md` |
| Swift sources, Xcode project, tests | F0 local gates green on Xcode 15.2 (`swift test` + simulator test); CI pending — `docs/environment.md` |

## Why it does not build here

The requirements are iOS-only: SwiftUI, SwiftData, HealthKit, WatchConnectivity.
Those need macOS with Xcode. This repository was initialised on Windows, so the
first phase (F0) happens on a Mac: verify the toolchain, generate the Xcode
project, and get CI green on a trivial test.

The one component that does not need the Mac is `RupfitCore`: a pure-Swift
package with no UI, no SwiftData and no HealthKit imports. It holds the domain
model and the progression engine, so it can be compiled and tested anywhere a
Swift toolchain exists.

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
