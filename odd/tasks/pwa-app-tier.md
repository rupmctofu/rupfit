# Rupfit — PWA app tier

Build the installed app on top of the engine that already exists. The design is
decided and drawn (`design/f2-mvp/renders/`, 24 artboards, plus the SwiftUI
implementation on `main` as a behavioural blueprint). The engine is done
(`src/core`, 137 tests). What is missing is the app tier: shell, eight screens,
IndexedDB persistence, backup, install and offline.

Free is the constraint that decides every trade-off here.

## Specs

S1 — Zero recurring cost, zero expiry.
Applies when: choosing hosting, tooling or any dependency.
No Apple account, no paid service, no domain purchase required, no build step that
needs macOS. The app deploys to GitHub Pages over HTTPS from this repository and,
once installed, never expires. GitHub Pages on a public repository and GitHub
Actions on it are free.

S2 — Installs on the owner's iPhone 14 Pro from Safari.
Applies when: deploying or changing the manifest.
Safari's "Añadir a pantalla de inicio" produces a standalone app with its own icon
and name, no browser chrome, launchable offline. `viewport-fit=cover` plus safe-area
insets; the status bar is styled, never assumed away.

S3 — Offline is normal operation, not a degraded mode.
Applies when: any read or write touches the network.
The shell loads from cache without a connection; confirming a set writes to
IndexedDB and never awaits a request; no screen shows a spinner for local data. The
network exists only to fetch the app bundle and to receive an update.

S4 — Fluid on the owner's phone, in a gym.
Applies when: specifying targets, transitions or feedback.
Interactive targets are at least 48 CSS px; a set is one tap to confirm; the set list
never reflows under the thumb; no layout shift on load; feedback for a confirmed set
is visual because iOS exposes no vibration API.

S5 — The eight approved screens, with their states.
Applies when: building any screen.
Inicio, Entrenar, Sesión, Resumen, Historial, Progreso, Peso corporal, Perfil, as
specified in `docs/design-system.md` §8 and drawn in `design/f2-mvp/renders/`
(`inicio-first`, `inicio-history`, `sesion-decision`, `sesion-first`, `sesion-resumed`,
`sesion-progress`, `resumen`, `resumen-partial`, `progreso-12w`, `progreso-single`,
`progreso-empty`, `peso-gaps`, `perfil`, `entrenar`, `entrenar-empty`,
`historial`, `historial-empty`, plus the error and photo variants). A screen is not
done until its listed states exist; the SwiftUI views on `main` are the reference for
behaviour, never a thing to copy blindly.

S6 — Local-first persistence with a real backup.
Applies when: storing or restoring anything.
IndexedDB stores, keys, indexes, invariants and migrations follow
`docs/data-model.md` §5–§7. Every confirmed set is committed in its own transaction
before the UI says it is confirmed. The backup document is versioned, exported as a
file and importable with validation, so an evicted storage container is recoverable.

S7 — HealthKit stays out.
Applies when: a screen would show sleep, HRV or resting heart rate.
Weight is manual, sleep and HRV are absent from every required field, and no screen
presents imported health data as if it existed. The optional iOS Shortcuts bridge
stays a later, droppable phase.

S8 — Closed dependency list.
Applies when: adding anything to the build.
Runtime dependencies are exactly `react`, `react-dom`, `idb` and `zod`. No router, no
CSS framework, no charting library, no state library, no web fonts, no analytics.
Charts are hand-written SVG. Adding one requires an ADR and an owner gate.

## Tasks

- T1 — Scaffold: Vite + React + TypeScript project references, closed dependency list, app shell with the four tabs and hash routing, install manifest. (S1, S2, S8)
  Done — shell and two project references (`e8002f5`), manifest and icons (`7acd7a3`).
- T2 — Design tokens and component library from `docs/design-system.md` §4–§7. (S4, S5)
  Done — `e02a31b`, reviewed in the gallery (`3e61193`).
- T3 — Storage: IndexedDB schema, repositories, invariants, migrations, backup export/import. (S6)
  Done — `d2025f2`.
- T4 — Session state machine and the Sesión screen (the decision screen). (S4, S5)
  Done — machine (`ca03c14`), moved into `src/core` (`18af14f`), screen (`1d37937`).
- T5 — Inicio, Entrenar and Resumen. (S5)
  Done — `86be6ab`.
- T6 — Historial, Progreso and Peso corporal, with hand-written SVG charts. (S5, S8)
  Done — `54cb2a7`.
- T7 — Perfil: settings, storage state, backup, install and update status. (S5, S6)
  Done — `bdf07a0`.
- T8 — Service worker, offline shell, install and update prompts, GitHub Pages deployment. (S1, S2, S3)
  Built, not closed — precache and update prompt (`ad607f7`), icons, manifest and the
  fail-closed workflow (`7acd7a3`). The workflow does not switch itself on: the owner
  enables Pages once, and until then nothing is published.
- T9 — Device verification on the owner's iPhone: install, offline start, screen lock, export/import round trip. (S2, S3, S6)

## Log

L1 — Owner: "podemos hacer una app gratis?"
Establishes the binding constraint: the outcome must not cost money. Answered: the PWA
is the only free path that installs permanently on iOS; nothing native is free.

L2 — Owner: "pues pwa, adelante".
Authorizes building the app tier. Push, pull request and merge remain owner decisions.

L3 — Owner, earlier constraint still in force: "que funcione bien, fluida en iPhone,
tengo un iPhone catorce Pro y que la instalemos".
Device target is the iPhone 14 Pro; install from Safari; fluidity is a requirement, not
an aspiration.

L4 — Owner: "pero en el macbook he visto interfaz con todas las paginas diseñadas",
followed by the `docs/design-renders` branch (24 artboards at 786×1704) and the native
implementation on `main` (F0–F5, 41 Swift files, engine, persistence, eight screens,
UI smoke test).
The design is decided. Screens are ported, not invented. The native app stays on `main`
as the behavioural reference and is not deleted.

L5 — Owner decision, recorded before this change: React stays and NFR-8 is the closed
runtime list (see `odd/tasks/pwa-platform.md` and `docs/product-requirements.md`).

L6 — 2026-11-08, state of the list. T1–T7 are done and hold a commit each; T8 is built
but not closed, because the Pages workflow is prepared and not enabled; T9 has not
started. `npm test` passes 569 tests in 36 files at `04f3b09`, and `npm run typecheck`
and `npm run build` are green on Windows. Nothing runs on the phone yet: no install, no
offline cold start, no force-quit resume and no export/import round trip, so no gate of
`docs/roadmap.md` is approved — the ones that wait on the owner are still waiting.
