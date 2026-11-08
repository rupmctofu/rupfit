# Rupfit

A strength-training coach for one person, installed on the iPhone Home Screen from
Safari: it remembers what you lifted, decides what you should attempt next, and gets
out of the way while you train.

Not a social fitness app. No streaks, badges, leaderboards or feeds. Offline-first,
deterministic, no account and no server. Built, tested and deployed from Windows.

## Status

**Documentation phase.** The documents are done; no application code is committed
 yet. Every claim below is traceable to a document; nothing here is implemented.

| Area | State |
| --- | --- |
| Platform decision record | Done — `docs/adr/0001-pwa-instead-of-native-ios.md` |
| Product requirements | Done — `docs/product-requirements.md` |
| Training science and evidence | Done — `docs/training-science.md` (sources verified 2026-11-08) |
| Architecture | Done — `docs/architecture.md` |
| Data model | Done — `docs/data-model.md` |
| Progression engine specification | Done — `docs/progression-engine.md` |
| Design system | Done — `docs/design-system.md` |
| Roadmap and phase gates | Done — `docs/roadmap.md` |
| TypeScript sources, app shell, service worker, tests | Not committed (phases F0 onwards, see roadmap) |

## Why the native plan was dropped

Rupfit was first specified as a native iOS app: SwiftUI, SwiftData, HealthKit, a
watchOS companion, built with Xcode on macOS. That plan was abandoned before any
code was written, for three reasons that no amount of engineering could remove:

1. A self-built app signed with a **free Apple account expires after seven days**.
   It stops launching until it is re-signed and re-installed from a Mac, weekly.
2. Removing that limit requires the **paid Apple Developer Program, 99 EUR/year,
   recurring**. The owner will not pay it: no subscription, no account.
3. The MacBook available here **cannot run a compatible Xcode**, so even the build
   path could not be executed on the hardware that exists.

A PWA does not have that problem, which is the whole reason it was chosen:

- Installation is Safari's "Añadir a pantalla de inicio" over HTTPS. There is **no
  developer account, no provisioning profile, no signing step and no expiry**.
  Installed once, it keeps launching.
- The build and release path is `npm` on Windows plus a static host. Nothing in it
  requires macOS, Xcode, a cable or a Mac.
- The shell is cached by a service worker and every byte of state is in IndexedDB,
  so a gym with no signal is the normal case, not the degraded one.

The decision, the alternatives that were rejected and what it costs are in
`docs/adr/0001-pwa-instead-of-native-ios.md`. The costs are real and are stated
there rather than glossed: no HealthKit, no watchOS app, no haptics, weaker
background execution, and manual export/import instead of automatic sync.

## Read in this order

1. `docs/adr/0001-pwa-instead-of-native-ios.md` — why the platform is what it is,
   and what the pivot costs.
2. `docs/product-requirements.md` — what the product must do, what it must not do.
3. `docs/training-science.md` — the evidence behind every training rule.
4. `docs/architecture.md` — the install contract, the platform's real limits,
   modules, stack and dependency rules.
5. `docs/data-model.md` — domain types, invariants, IndexedDB schema, migrations.
6. `docs/progression-engine.md` — the deterministic load engine and its tests.
7. `docs/design-system.md` — tokens, components, accessibility, gym constraints.
8. `docs/roadmap.md` — phases, gates, test matrix.

## Ground rules

- No claim of "implemented" without a test that fails when the behaviour breaks.
- No citation that does not resolve to a real record (see `docs/training-science.md`).
- No simulated data presented as real, no fake integrations.
- Training data is health data: it stays on the device, in the browser's local
  storage for this app. Nothing is transmitted anywhere.
- No document may describe a build, test or release step that cannot run on Windows,
  and none may present a native Apple platform as part of the plan.
- A platform limit that is not verified is described as uncertain, along with what
  the app does to stay safe. Guessing at an iOS behaviour is how the last platform
  plan went wrong.
