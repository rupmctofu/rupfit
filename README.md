# Rupfit

A strength-training coach for one person, installed on the iPhone Home Screen from
Safari: it remembers what you lifted, decides what you should attempt next, and gets
out of the way while you train.

Not a social fitness app. No streaks, badges, leaderboards or feeds. Offline-first,
deterministic, no account and no server. Built and tested from Windows.
## Status

**App tier, gate by gate.** The documents, the engine and the app exist. The app
builds, typechecks and passes 569 tests in 36 files at `04f3b09`. The install contract
is not verified on the owner's phone yet: that check needs a published HTTPS URL and a
device, and neither has happened.

Each row names the commit that holds the work, so the claim can be checked with
`git show --stat <commit>`. No phase gate in `docs/roadmap.md` is closed.

| Area | What exists | Commit |
| --- | --- | --- |
| Progression engine | `src/core/domain` and `src/core/engine`: `recommend`, rounding, reason codes, readaptation, confidence. Scenario table, property tests and the worked examples as executable tests. | `c0ef31c` |
| Platform documents | The pivot to the PWA: `docs/adr/0001-pwa-instead-of-native-ios.md` plus the rewritten README, architecture, data model, design system, product requirements, engine specification and roadmap. | `5a11c79` |
| App scaffold | Vite + React + TypeScript with two project references, hash routing and the four tabs. | `e8002f5` |
| Persistence and backup | `src/storage`: IndexedDB schema, repositories, invariants, migrations, the versioned backup document, export and validating import, with the storage test suite. | `d2025f2` |
| Design system | `src/design-system`: tokens for two skins and two themes, and the 26 components the screens are built from. | `e02a31b` |
| Component gallery | `#/galeria`, the review surface for every component and its states. | `3e61193` |
| Session state machine | The transition table as a pure module, moved out of `src/features` so it stays free of React, storage and the clock. | `ca03c14`, `18af14f` |
| Sesión screen | The training sheet: exercise card, decision bar, set rows, rest bar, with its controller. `#/sesion` runs on the real storage port, `#/sesion/demo` on fixtures. | `1d37937` |
| Perfil | Settings, backup round trip, storage inventory, and install and update status. | `bdf07a0` |
| Progreso, Historial, Peso corporal | Weekly aggregates, personal records and the body-weight series over hand-written SVG charts. | `54cb2a7` |
| Install surface | The PNG icon set (192, 512, maskable 512, Apple touch icon), the web manifest with `standalone`, and the fail-closed GitHub Pages workflow. | `7acd7a3` |
| Inicio, Entrenar, Resumen | The three screens around a session, with their empty, rest-day and partial states. | `86be6ab` |
| Starting a session from the plan | Inicio offers the day the plan has today (or the next one in the rotation) and opens Sesión with that day's prescriptions; the summary hands the result back. | `04f3b09` |
| Service worker and handoff | Registration at launch, the prompt-based update banner, and the session-to-summary handoff. | `ad607f7` |
| Editing the routine | Not built: `Entrenar` reads the plan and writes nothing back to it. | — |
| Recording a body measurement | Not built: `#/progreso/peso` reads stored measurements; nothing in the app creates one. | — |
| Device verification | Not recorded: no dated line in `docs/environment.md` (that file does not exist), no install, no offline cold start and no export/import round trip on the phone. The captures in `odd/evidence/` carry no record of where they ran, so they are not evidence of an installed app. | — |

## Where it stands

Eight screens exist: Inicio, Entrenar, Sesión, Resumen, Historial, Progreso, Peso
corporal and Perfil. Four are tabs, two (Sesión and Resumen) are sheets over the tab
bar, and two (Historial and Peso corporal) are drill-downs inside Progreso; all of
them are reachable by hash route. `#/galeria`, `#/sesion/demo` and `#/resumen/demo`
are review surfaces on the same components, not screens in their own right.

The app starts a session from the stored plan: Inicio offers the day the plan has and
opens Sesión with that day's exercises; Sesión runs decision → set → rest and writes
each confirmed set through the storage port; Resumen closes what was actually done.
Perfil exports and imports the versioned backup, and the shell registers the service
worker at launch.

What does not exist yet:

- editing the routine in the app;
- recording a body measurement from a screen;
- any device evidence — install, offline cold start, force-quit resume and the
  export/import round trip on the iPhone have not been recorded, because the app is
  not published anywhere yet.

## Run it

```
npm install
npm run dev        # http://localhost:5173 — the shell; no service worker, no install
npm test           # Vitest: engine, storage and screen suites
npm run typecheck  # both project references, --noEmit
npm run build      # typecheck, then the bundle and the precache manifest
npm run preview    # http://localhost:4173/rupfit/ — the build, service worker included
```

The install path needs HTTPS and a service worker. That leaves `npm run preview`
(localhost is a secure context) and the published GitHub Pages URL; the dev server
has neither, so it can never install the app and its behaviour says nothing about the
installed one.

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
