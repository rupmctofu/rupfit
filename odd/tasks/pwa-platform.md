# Rupfit — PWA platform pivot

Replace the iOS-native plan (SwiftUI/SwiftData/HealthKit/Xcode on macOS) with an
offline-first PWA that installs from Safari to the Home Screen on an iPhone 14 Pro,
developed entirely on Windows, at zero recurring cost and with no re-signing.

The domain model, the training science and the deterministic progression engine
survive the pivot unchanged in substance. Only the platform layer changes.

## Specs

S1 — No recurring cost and no periodic re-signing.
Applies when: the owner installs or launches Rupfit.
The app must not require an Apple Developer Program membership, a TestFlight build,
or any signature that expires. Installing once must keep working indefinitely.

S2 — Installable from the browser on the owner's iPhone 14 Pro.
Applies when: the owner installs Rupfit on iOS.
Installation is Safari's "Añadir a pantalla de inicio" over HTTPS: standalone launch
(no browser chrome), own icon and name, no Xcode, no cable, no Mac. The build,
test and deploy path must run on Windows; no step may require macOS.

S3 — Fluid and network-independent during a workout.
Applies when: the owner trains in a gym without reliable signal.
Reading and writing a set must be served from local storage with no network round
trip; the app shell must load from cache offline; no UI action may await the network.

S4 — HealthKit is out of scope; sleep and HRV are not requirements.
Applies when: designing features or scheduling phases.
No HealthKit, no watchOS companion, no "health data" dependency in the MVP or in the
domain model's required fields. A later, optional bridge may read Apple Health through
iOS Shortcuts and import a JSON document through the normal import path. Sleep, HRV
and resting heart rate must never be required inputs; body weight stays manual.

S5 — Training data lives on the device and is exportable.
Applies when: data is persisted, backed up, or the owner changes phone.
Durable state lives in the browser's IndexedDB. The app provides a versioned JSON
export and a validating import, so a lost Safari storage container is recoverable.
No account, no server-side user data, no telemetry.

S6 — The progression engine is pure TypeScript, test-first.
Applies when: implementing the engine.
`docs/progression-engine.md` is the specification. The engine is a set of pure
functions over plain data with no I/O, no DOM and no storage access; its scenario
table (§11.1) and property tests (§11.2) are executed as automated tests, RED before
GREEN. Rounding, increments, decision order and reason codes must match the document.

S7 — No loss of the existing evidence base or domain design.
Applies when: rewriting repository documents.
`docs/training-science.md` is not modified. Value types, entities, invariants, the
recommendation normalisation and the crash-recovery state machine are carried over
from `docs/data-model.md`; storage mechanics are re-expressed for IndexedDB without
weakening an invariant.

S8 — Documentation tells the truth about the platform.
Applies when: any document mentions build, toolchain, phases or integrations.
No document may claim Swift, Xcode, SwiftData, HealthKit, watchOS or macOS as part of
the plan. The roadmap, architecture, data model and README describe the PWA plan and
its real constraints (iOS WebKit limits, storage eviction, no HealthKit, no background
sync), and an ADR records why the pivot happened and what it costs.

## Tasks

- T1 — Platform decision record and document rewrite (S1, S2, S4, S7, S8): ADR, README, architecture, data model, roadmap.
- T2 — Design system and PRD platform statements (S2, S4, S8): mobile-Safari constraints, safe areas, no haptics, install flow.
- T3 — Engine scaffold and domain value types (S6, S7): TypeScript project, Vitest, pure domain types.
- T4 — Progression engine test-first (S6): scenario table, property tests, reason codes, rounding.
- T5 — Persistence and export/import contract (S5): IndexedDB schema, versioned backup document, validating import.

## Log

L1 — Owner, original request (verbatim):
"Bueno principalmente hemos empezado el proyecto aquí en Windows, pero finalmente hemos decidido ir a MacBook para hacer una aplicación nativa. Lo que nos hemos encontrado a la hora de ponerlo en el iPhone es que la diferencia de versiones no es compatible y luego que la aplicación dura siete días el permiso y hay que reinstrar la cada siete días o si no pagar una suscripción de noventa y nueve euros al año o algo así. Entonces creo que es mejor hacerla en Windows y hacer una web app o una PWA lo que me digas que es mejor, pero que no quiero ni que tener que pagar ni tener que registrarla cada siete días, o sea, que funcione bien, fluida en iPhone, tengo un iPhone catorce Pro y que la instalemos o sea una web y la guarde lo que sea más fácil y que al fin y al cabo funcione, aunque pierda un poco el acceder a los stats del salud, del sueño y todo eso, si se puede hacer mejor, si no, tiramos para antes."

L2 — Owner decision, health data: "Sin HealthKit ahora, puente vía Atajos de iOS después".
HealthKit is not an MVP dependency. A later optional bridge reads Apple Health through
iOS Shortcuts and feeds the normal import path. No paid developer account. (Spec S4.)

L3 — Owner decision, scope of this change: "Sí: reescribe los docs a PWA y arranca por el motor".
Authorized: rewrite the repository documents to the PWA architecture and start with the
progression engine, test-first. Push, pull request and merge remain owner decisions.
