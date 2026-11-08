# Rupfit — Roadmap

Status: plan. Phases F0–F7 are partly built; no gate is closed. The state of every
phase is recorded in §3, and the gaps between the plan and the code are listed at the
end of §3. Read this with `docs/product-requirements.md`; every
requirement ID referenced here exists there. Every phase runs on Windows: a step
that needs macOS, Xcode, a paid account or a signed binary is a defect in this plan,
not a missing tool (`docs/adr/0001-pwa-instead-of-native-ios.md` §6).

---

## 1. How this document is used

- Phases are sequential. A phase starts only when the previous **gate** is green.
- A gate is a thing that can be observed, not a feeling. "The engine test suite
  passes" is a gate; "the engine works" is not.
- Work is committed in reviewable units of roughly 400 changed lines, with tests and
  documentation in the same unit as the behaviour, on a feature branch.
- Anything not listed here is not being built. New scope enters by editing
  `product-requirements.md` first.
- Manual device checks are part of a gate, not an afterthought. Each one produces a
  dated line in `docs/environment.md` with the iOS version and the observed result.

## 2. Definition of Done (applies to every phase)

1. The deliverables exist and are linked from this document.
2. The phase's automated tests pass locally on Windows **and** in CI.
3. Manual device checks listed in the phase have been performed and recorded, or the
   phase says explicitly that it has none.
4. No document claims more than the tests and checklist prove; nothing is described
   as working that has not been run.
5. The diff has been read end to end before the phase is called closed.
6. Documentation updated in the same commit as the behaviour it describes.
7. No step in the phase required macOS, Xcode, a developer account or a signed
   binary.

---

## 3. Phases

The order is deliberate: the engine needs no UI, and the UI needs no storage. Each
phase produces something the owner can judge before the next one adds a layer that
could hide a mistake in the previous one.

State of the phases, read from the repository on 2026-11-08. "Built" means the
deliverable exists and its automated tests pass; it does **not** mean the gate is
green. Only the owner closes an owner gate, and no gate line exists for G1–G5.

| Phase | Built | Evidence | Gate |
| --- | --- | --- | --- |
| F0 | toolchain only | `c0ef31c`, `e8002f5` | open — no boundary check, no `docs/environment.md` |
| F1 | documents and ADR | `5a11c79` | open — G1 waits on the owner |
| F2 | the 24 artboards, on another branch | `origin/docs/design-renders` | open — G2 waits on the owner |
| F3 | domain, engine, session table | `c0ef31c`, `ca03c14`, `18af14f` | open — no mutation check, no boundary check |
| F4 | shell, Sesión, the screens | `e8002f5`, `e02a31b`, `3e61193`, `1d37937`, `86be6ab`, `04f3b09` | open — G3 and the phone checks unrecorded |
| F5 | storage, backup, recovery | `d2025f2`, `1d37937` | open — device checks unrecorded |
| F6 | manifest, service worker, workflow | `7acd7a3`, `ad607f7` | open — never deployed, no device evidence |
| F7 | Progreso, Historial, Peso corporal | `54cb2a7` | open — MVP acceptance needs the installed app |
| F8 | nothing | — | not started |

### F0 — Environment and skeleton

**State: partly built; gate open.** The toolchain exists and runs: `c0ef31c` adds
`package.json` (`dev`, `build`, `preview`, `test`, `typecheck`), the strict
`tsconfig.json` and `vitest.config.ts`; `e8002f5` adds the app shell, the two project
references and the Vite config. On 2026-11-08, on Windows, `npm run typecheck`,
`npm test` (569 tests in 36 files, at `04f3b09`) and `npm run build` are green. Four
deliverables
are still missing: `tools/check-boundaries.mjs`, the `check:boundaries` script,
`docs/environment.md`, and the `check` job of `architecture.md` §13.
`.github/workflows/pages.yml` runs test, typecheck and build before deploying, which
is not the same thing: it is not the boundary check and it runs only on `main`. The
gate fails on the boundary check (no rule-breaking import has ever been rejected by
the repository) and on the missing `docs/environment.md`.

**Purpose:** turn a documentation-only repository into one that builds and is
verified by a machine, on Windows.

Deliverables:

- `package.json` (Vite, TypeScript, Vitest) with one script per concern: `dev`,
  `build`, `preview`, `test`, `typecheck`, `check:boundaries`.
- `tsconfig.json` in strict mode, and an app shell that launches to an empty screen
  with one passing test.
- `tools/check-boundaries.mjs` implementing the dependency rule of
  `architecture.md` §4, proven by adding a deliberate violation and watching CI fail.
- `docs/environment.md` recording the **verified** versions: Windows build,
  `node --version`, `npm --version`, Vitest version, the desktop browser used for
  review, and the iPhone's iOS version.
- `.github/workflows/ci.yml` with the `check` job of `architecture.md` §13.
- Repository hygiene: remote configured, branch protection optional, no secrets, no
  committed build output.

Exit gate:

- `npm run typecheck`, `npm run check:boundaries`, `npm run test` and `npm run build`
  green locally on Windows.
- The same four green in CI on a pushed branch.
- `docs/environment.md` exists with real command output pasted in.
- A rule-breaking import was rejected by CI at least once (the check is not
  decorative).

**Note:** there is no blocker note any more. The native plan's first phase could not
start without a Mac; this one cannot fail for that reason.

### F1 — Documents and science

**State: deliverables done; gate G1 open.** The documents and
`docs/adr/0001-pwa-instead-of-native-ios.md` are committed (`5a11c79`), on top of the
earlier document commits `7074071`, `7522d80`, `f46de9b`, `1f0b2ef` and `0f494a7`.
Two gate items are settled in writing: D-6 and D-7 are retired in
`product-requirements.md` §8, and the NFR-8 conflict is closed by owner decision
(`odd/tasks/pwa-app-tier.md` L5). What no line records is the review itself: that the
requirements and the training rules were read and accepted or corrected. G1 is open
and waiting on the owner. `tools/check-citations.sh` was not written; the phase marks
it SHOULD, and every DOI was verified by hand once (`training-science.md`).

**Purpose:** the specification the rest of the work is reviewed against.

Deliverables: the documents in `docs/` (this one included, with
`docs/adr/0001-pwa-instead-of-native-ios.md`), plus optionally
`tools/check-citations.sh` — a script that re-resolves every DOI in
`training-science.md` through Crossref and fails on a mismatch. SHOULD, because it
converts "I verified the citations once" into "the citations are verified today".

Exit gate:

- Owner review of `product-requirements.md` and `training-science.md`: no
  requirement contradicts another, and no training rule is unexplained.
- Every DOI resolves (manual check or the script).
- Every open decision in `product-requirements.md` §8 that still applies is accepted
  or overridden in writing. D-6 (deployment target) and D-7 (Xcode project
  generation) are void under ADR-0001 and are retired when that document is next
  edited; they are not implemented.
- The NFR-8 conflict is closed by owner decision: NFR-8 now *is* the closed runtime
  list of `architecture.md` §3.3 (`react`, `react-dom`, `idb`, `zod`), React stays,
  and any addition needs an ADR and a gate. Any document still describing the
  conflict as open is wrong and is corrected before this gate closes.
- No document presents Swift, Xcode, SwiftData, HealthKit, watchOS or macOS as part
  of the plan (S8). Documents that still carry the retired platform are corrected
  before this gate closes; a violation that cannot be corrected in the same work unit
  is named in that unit's commit message rather than left silent.

### F2 — Product design (owner gate)

**State: artboards done on another branch; gate G2 open.** The reviewed renders — 24
screens at 786 × 1704 plus the `skin-a/` variants — are on `origin/docs/design-renders`,
under `design/f2-mvp/renders/`, and are not on this branch. The implementation is
measured against them:
`src/design-system/README.md` lists every disagreement it resolved and says which
source won. No line records the owner approving the training screen, which is the one
review this gate exists for, so G2 is open — it waits on the owner's explicit yes for
the Sesión design, not on more drawing.

**Purpose:** see the training experience before any of it is coded.

Deliverables (artboards, `design/<slug>/`, opened on the design canvas):

1. Training screen — exercise card, decision bar, set row, rest bar.
2. Session summary.
3. Home with and without history.
4. Progress with a single data point and with twelve weeks of data.
5. Install instructions — the two taps in Safari, drawn on a phone, because
   installation is a user gesture and not something the app can trigger.
6. Perfil → backup, storage and install explanation, including what is not stored
   anywhere else.
7. States: first time (no data), resumed session, invalid import, error banner.

Exit gate:

- **Owner approval of the training screen** — this is the one design review that
  must not be skipped, because it is the screen used while out of breath.
- Every screen in `design-system.md` §8 has its empty state drawn.
- No artboard promises a platform capability that `architecture.md` §2.2 lists as
  absent (haptics, Health, watch, push).

### F3 — Domain and engine (the highest-value phase)

**State: built; gate open on two items.** `src/core/domain` and `src/core/engine` hold
the types, `recommend`, rounding, reason codes, readaptation and confidence, with the
scenario table, the property tests and the four worked examples as executable tests
(`c0ef31c`). The session transition table came later (`ca03c14`) and was moved into
the pure group (`18af14f`). `src/core` imports no React, no storage module, no DOM
global and no clock, which holds by inspection of the imports but is not enforced by
anything, because `tools/check-boundaries.mjs` does not exist. No record of the
mutation check exists; the gate is open on that and on the boundary check. Two
deliverables are missing or elsewhere: `src/core/seed` was never written (there is no
seeded exercise library), and the statistics live in
`src/features/progress/aggregates.ts`, not in `src/core/statistics`.

**Purpose:** the logic that must be right, written before any UI can hide a mistake.

Deliverables:

- `src/core/domain`: the types of `data-model.md` §2–§3 with their invariants.
- `src/core/engine`: `recommend(input)`, `evaluateBlock(...)`, rounding, reason codes.
- `src/core/statistics`: volume, hard sets, e1RM, records, weekly aggregates.
- `src/core/session`: the transition table of `data-model.md` §7, as pure functions.
- `src/core/seed`: the exercise library (at least 40 exercises, every movement
  pattern represented) as typed data, with a test asserting coverage.
- Test suites: scenario table T-01…T-32, property tests P-1…P-8, statistics
  fixtures, state-machine transitions.

Exit gate:

- All scenario and property tests green, including the four worked examples of
  `progression-engine.md` §9.
- A mutation check: deliberately breaking rule order (for example moving discomfort
  below top-of-range) must fail at least three tests. If it does not, the suite is
  decorative.
- `src/core` imports no React, no DOM global, no storage module and no `fetch`
  (boundary check green).
- No clock, no `Date.now()`, no randomness inside the engine: time arrives as an
  argument.

**Note:** no screen exists at the end of this phase, deliberately. The engine is the
only component whose failure would be silent, and it needs no interface to be
verified.

### F4 — App shell and training screen (owner gate)

**State: built; gate open.** The shell with the four tabs and hash routing
(`e8002f5`), the tokens and components (`e02a31b`) with the gallery (`3e61193`), the
Sesión sheet over the real storage port with its controller and its fake port
(`1d37937`), and Inicio, Entrenar and Resumen (`86be6ab`), with Inicio handing the
day's plan to Sesión (`04f3b09`). The automated gate item has a test. None of the
manual ones does: the flow on a phone over a preview URL, Dynamic
Type XXL, VoiceOver on the decision bar and the set row, the rest bar against the home
indicator, and the owner's review in a real gym. The gate also assumed a preview
published from a preview branch; GitHub Pages is wired for `main` only (`7acd7a3`) and
nothing is published, so G3 cannot be reached yet.

**Purpose:** the experience the product is judged on, before storage makes it
durable.

Deliverables:

- Navigation (`Inicio`, `Entrenar`, `Progreso`, `Perfil`) with the states of
  `design-system.md` §8.
- Exercise card paging (swipe + chevrons), decision bar, set rows, rest bar.
- Session summary and history read-out.
- Design tokens and components from `design-system.md` §3–§7, with the preview
  matrix.
- **In-memory implementations** of the ports of `architecture.md` §7, wired in
  `src/app/container.ts`. The shell is real; the storage behind it is a fake for
  exactly one phase, behind the same interface F5 replaces.
- A static preview published over HTTPS to this repository's GitHub Pages from a
  preview branch, so the shell can be reviewed on the phone. No manifest, no
  service worker: preview only (`architecture.md` §9). This is where the GitHub
  Pages base path is decided and recorded.

Exit gate:

- Vitest: the session store path — start → decide load → confirm two sets → finish
  → summary — produces the state the summary renders, from fixed fixtures.
- Manual on the phone over the preview URL: the same flow two taps per set; Dynamic
  Type XXL without clipping; VoiceOver labels on the decision bar, the set row and
  paging; the rest bar sits above the home indicator, not under it.
- **Owner review in a real gym** — the only gate that cannot be automated.
- No screen has a missing empty state.
- Known and stated limitations at this gate, so nobody mistakes the preview for the
  product: a reload loses the session in progress (F5), and the preview needs a
  connection to load at all (F6). The gym review judges the flow, not the platform.

### F5 — Persistence, backup and recovery

**State: built; gate open on the device checks.** `src/storage` carries the schema,
the repositories, the invariants, the migrations, the versioned backup document and
the validating import, with its own test suite (`d2025f2`). The session writes each
confirmed set through the port (`1d37937`), and the crash-recovery state machine is
pure and lives in `src/core/session` (`ca03c14`, `18af14f`). The automated gate items —
mapper round trips, kill and restore, invalid import, `merge` run twice, migration, and
the typed confirmation a `restore` requires — have tests. The two manual ones
(log two sets and force-quit; export, empty the app, import everything back) have no
recorded result, because there is no installed app to run them in.

**Purpose:** make the engine's answers durable, the session crash-proof, and the
data recoverable when the browser container is lost.

Deliverables:

- `src/storage`: `db.ts` (version 1, index creation, blocked/blocking/terminated
  handlers), flat records, bidirectional mappers, repositories for every store.
- Per-set transactions, the I-9 guard, the transactional delete routine and the
  open-time orphan scan (`data-model.md` §5.4, §6).
- Resume / partial-finish at the data level, and the rest timer derived from
  `confirmedAt`.
- Backup export with its three delivery paths, and importing with `zod` validation in
  both modes (`restore`, and `merge` for activities and measurements only).
- The storage-persistence probe on first launch (expected to report the API absent)
  and the advisory path when storage is not persistent.

Exit gate:

- Mapper round-trip tests both directions for every record.
- Kill/restore test: confirm 2 of 4 sets, close the database, reopen, and the session
  resumes at set 3 with the correct remaining rest time.
- Import of an invalid document changes nothing (row counts identical, and the store
  comparable field-by-field for the fixture).
- `merge` import run twice with the same document creates no duplicates (I-11).
- A `restore` import requires a typed confirmation and reports the row counts it is
  about to replace before writing.
- Migration test proving a store written by version 1 opens unchanged when the
  migration step list is empty.
- Manual on the phone: log two sets, force-quit, reopen, resume correctly; export,
  then import the export into an emptied app, and every row comes back.
- At least one export path works from the phone in Safari, recorded with the iOS
  version. The installed-app context is checked again in F6, because it is a
  different container.

### F6 — PWA install, offline cache and deploy (owner gate)

**State: built, never deployed; gate open.** The PNG icon set, the manifest with
`standalone`, the Apple touch icon and the fail-closed Pages workflow are in
`7acd7a3`; registration at launch and the prompt-based update banner are in
`ad607f7`. `npm run build` emits `sw.js` and a precache manifest, so the pieces exist.
None of the gate is evidenced: the workflow does not switch itself on (the owner
enables Pages once in Settings), no URL is published, and no install, offline cold
start, update flow or seven-day survival has been observed on the phone. G4 has
nothing to judge yet.

**Purpose:** make it installable, permanent and network-free — the three properties
that replaced the native plan (S1, S2, S3).

Deliverables:

- Manifest (`display: standalone`, name, icons including maskable 512, theme and
  background colours), plus the Apple meta tags in `index.html`.
- Service worker via `vite-plugin-pwa`: precache the build output, `navigateFallback`
  to `index.html`, prompt-based updates, no `skipWaiting`.
- Update banner, and the build stamp in `Perfil`.
- GitHub Pages deploy job replacing the manual publish of F4: HTTPS, and the base
  path, `scope` and `start_url` chosen there verified rather than re-chosen.
- Install instructions as shipped copy.
- The offline and install checklist.

Exit gate:

- Installed from Safari on the owner's iPhone: own icon, own name, standalone
  launch, present in the app switcher, no browser chrome.
- Airplane mode cold start: reaches the session screen with no network and shows
  stored history. Time to interactive measured and recorded (NFR-1).
- A full session logged in airplane mode, force-quit, reopened: nothing lost.
- Update flow observed end to end: deploy a change, launch, banner appears, update
  applies on the next cold start, no session lost.
- Install survives **seven days and at least one device restart** with no
  re-installation, no re-signing and no account — the direct check against the native
  plan's failure mode (S1).
- The export that worked in F5 still works from the installed app (a different
  storage container from the Safari tab), and the exported document imports back.
- Storage behaviour recorded: what the persistence probe reported, what the app
  said, and the eviction behaviour observed over the seven days.
- Owner gate G4: the install and backup contract is acceptable in daily use.

### F7 — Progress, body weight, measurements

**State: mostly built; gate open.** Progreso, Historial and Peso corporal render from
weekly aggregates, personal records and the stored body-weight series, with
hand-written SVG and the e1RM and mean-suppression rules (`54cb2a7`). The automated
suite covers the three chart states, the gap between two trained weeks, the e1RM
suppression above twelve effective reps and the 7-day mean below three samples. Two
things are missing on purpose: the measurement UI, which this phase defers to `P1`,
and the acceptance run of `product-requirements.md` §6, which the gate places on the
installed app. Not yet evidenced at gate level: the chart fixtures at 0, 1, 3 and 40
points as a single named case, and the index-only reads. The body-weight series is
read-only in the app: nothing writes a measurement except an import.

**Purpose:** the history becomes readable, from the same stored evidence.

Deliverables: per-exercise charts, PR list, weekly volume per muscle, body-weight
series with the 7-day mean and goal, measurement storage (UI for the extra measures
is P1). Charts are hand-written SVG (ADR-006).

Exit gate:

- Chart fixtures with 0, 1, 3 and 40 data points render without a misleading line.
- Every estimated value is labelled and dashed; the e1RM suppression rule holds.
- Body-weight mean suppresses itself below 3 samples in the window.
- No chart reads a whole store: each uses the index named in `data-model.md` §5.1.

**MVP acceptance:** `product-requirements.md` §6 is evaluated when this phase's gate
is green, on the installed app, not on a desktop browser.

### F8 — Optional: iOS Shortcuts → Apple Health bridge (P1, droppable)

**State: not started.** No measurement of what a Shortcuts action can read on the
owner's iOS version exists, no recipe, no fixture document. It stays a later,
droppable phase, and ADR-0001 §5 stands as the accepted cost until it starts.

**Purpose:** give back part of what ADR-0001 §5 gives up, without an integration and
without a dependency.

Deliverables:

- A measurement first, recorded in `docs/environment.md`: which Health values a
  Shortcuts action can read on the owner's iOS version, and whether it can hand a
  JSON file to the installed app without an extra step.
- The documented shortcut recipe (what it reads, what document shape it writes, how
  the owner runs it).
- Fixture documents exercising the existing `merge` import; no new import path is
  created for the bridge.

Exit gate:

- A real shortcut run on the phone produces a document that imports with `merge`.
- Running it twice duplicates nothing (I-11).
- An invalid document from the shortcut is rejected with a field path, and training
  data is untouched.
- The app is unchanged when the bridge is not used at all.
- Owner gate G5: the manual step is worth it. If it is not — or if the measurement
  shows the bridge needs a step nobody will perform weekly — F8 is dropped, the
  recipe is not written, and ADR-0001 §5 stands as the accepted cost.

### Open work recorded at this state

These are gaps between the plan above and the code in the repository, not new scope.
They are written down so the next work unit starts from the code and not from the plan.

1. **Editing the routine.** `Entrenar` reads the plan and nothing in the app writes
   one: there is no editor screen and nothing saves a plan back. The stores and
   repositories exist (`d2025f2`), so the plan can only arrive by import today.
2. **Recording a body measurement from the app.** `#/progreso/peso` renders the stored
   series, the 7-day mean and the goal (`54cb2a7`); no screen writes a measurement, so
   the series only grows through an import.
3. **Three duplicated formatting modules.** `src/features/home/format.ts`,
   `src/features/progress/format.ts` and `src/features/session/format.ts` each decide
   how a weight, a volume or a date is written; `formatWeight` and `formatVolume` are
   duplicated verbatim between progress and session, and the comment in
   `progress/format.ts` already names `src/core` as their shared home. Until they move,
   the Spanish decimal and unit rules are pinned by two test files that can drift
   apart.
4. **No seeded exercise library.** F3 lists `src/core/seed`, at least 40 exercises with
   a coverage test. It does not exist: `Entrenar` shows what the store holds, so a fresh
   install has nothing to suggest. F7 also lists weekly volume *per muscle*; the built
   aggregates report volume and hard sets per week, without the muscle split.
5. **Device verification needs a published URL.** Every manual item in F4, F5 and F6,
   and the §6 acceptance in F7, waits on an app installed from an HTTPS URL. The Pages
   workflow exists and is not enabled (`7acd7a3`); publishing it and running the
   checklists is the shortest path to closing three gates at once.
6. **No `docs/environment.md`.** F0 requires it, and §1 says every manual check produces
   a dated line in it. It does not exist, so by this document's own rule every manual
   check listed above is unperformed.

---

## 4. Test matrix

| Phase | Unit (Node, Vitest) | Storage integration (`fake-indexeddb`) | Manual on the iPhone |
| --- | --- | --- | --- |
| F0 | trivial | — | — |
| F1 | — | — | owner document review (desktop) |
| F2 | — | — | owner design review (artboards) |
| F3 | T-01…T-32, P-1…P-8, statistics fixtures, state machine, mutation check | — | — |
| F4 | session store path (pure reducer), value formatting | — | shell flow on the preview URL, accessibility, gym review |
| F5 | mappers, import validation | kill/restore, migrations, delete cascade, `merge` dedupe | export/import round trip, force-quit resume |
| F6 | — | — | install, offline cold start, update, seven-day survival |
| F7 | chart fixtures, mean suppression | index-only reads | chart readability at 0/1/3/40 points |
| F8 | import fixtures | `merge` idempotency | shortcut run, invalid-document rejection |

The automated set is where the irreversible risks are: a wrong recommendation, a
lost or corrupted record, a bad import. Everything that depends on how WebKit
behaves on one phone is a manual check with a recorded result — it cannot be
automated from Windows, and pretending a desktop browser is the same engine would be
worse than not testing.

State of the matrix on 2026-11-08: every unit and storage row through F7 has passing
tests in this repository (569 tests in 36 files at `04f3b09`). No cell in the last
column has been performed, because `docs/environment.md` does not exist and no build has
been published.

---

## 5. Work-unit and commit policy

- Branch per phase (`f3-engine`), merged to `main` when the gate is green.
- A work unit is one behaviour change with its tests and docs; target ~400 changed
  lines. A larger unit is split, not committed whole.
- Conventional Commits (`feat(core): …`, `test(engine): …`, `docs: …`).
- A unit whose risk assessment names a high-risk item (stored data, migration,
  import, service worker, delivery) gets its own commit so it can be reviewed alone.
- No commit claims a behaviour that its own tests do not demonstrate.
- Push, pull request and merge are owner decisions.

---

## 6. Environment checklist for Windows (F0, run in this order)

```powershell
node --version                 # current LTS; record the exact version in docs/environment.md
npm --version
git clone <remote> rupfit; cd rupfit
npm ci                         # must install with no native build step
npm run typecheck
npm run test
npm run build
npm run preview                # http://localhost:4173, desktop review only
gh auth status
```

Then paste the real outputs into `docs/environment.md`, together with the iPhone's
iOS version and the Safari version. `npm run preview` proves the build works on
Windows; it says nothing about the phone, which is what the F4 and F6 checklists are
for.

If any step above needs macOS, Xcode, a provisioning profile or a paid account, the
step is wrong and the plan is corrected — not worked around.

---

## 7. Owner gates and what is being decided

| Gate | Phase | Decision the owner makes | State on 2026-11-08 |
| --- | --- | --- | --- |
| G1 | after F1 | Requirements and training rules accepted or corrected, including the closed dependency list (NFR-8, resolved) | open — waiting on the owner reading `product-requirements.md` and `training-science.md`. NFR-8 and the retirement of D-6/D-7 are already settled in writing |
| G2 | after F2 | Training screen design approved | open — waiting on the owner's explicit yes for the Sesión design; the artboards exist on `docs/design-renders` |
| G3 | during F4 | The session flow is usable in a real gym | open — waiting on a phone session that can happen at all, which needs a published URL |
| G4 | after F6 | Install, storage and backup behaviour accepted for daily use | open — waiting on an installed app and the seven-day observation |
| G5 | after F8 | The optional Apple Health bridge is worth its manual step | open — F8 has not started |

Nothing is built on top of an unapproved gate. That rule has already been broken once:
the app tier of F4–F7 was built while G1–G4 were open, which is where this repository
stands today. The rule is not retroactively satisfied by anything below; the gates stay
open until the owner records a decision, and each one says above what it waits for.

---

## 8. Risk register

| Risk | Trigger to act | Response |
| --- | --- | --- |
| Safari evicts the storage container and history is lost | a launch shows an empty store, or `estimate()` nears the quota | Install to the Home Screen, keep the export cheap and remind in `Perfil`; the export is the only true backup |
| A WebKit behaviour contradicts `architecture.md` §2.2 | an F5 or F6 checklist item fails | Measure on the phone, record it in `docs/environment.md`, adjust the design; never claim the assumed behaviour afterwards |
| Wrong base path or scope: the app installs and then fails offline | the offline cold start in F6 shows a blank screen | Decide `base`/`start_url`/`scope` once, test in airplane mode; this is the failure that looks like success |
| A bad deploy bricks the cached shell | the owner reports a white screen offline | Prompt-based updates keep the previous precache until activation; rollback is revert plus redeploy |
| Shell regressions reach the phone twice | two regressions in a row pass the manual checklist | Add a Playwright WebKit smoke test of the session flow (the first browser automation, deliberately not in the MVP) |
| Session flow rejected at G3 | the owner cannot log a set quickly | Redesign before F5; do not build persistence under an unusable screen |
| Engine scenarios insufficient | a real session produces a surprising recommendation | Add the scenario as a regression test first, then change the rule and the science table |
| A dependency is added without review | `package.json` differs from `architecture.md` §3.3 | CI compares the two and fails; the list is edited deliberately or the dependency is removed |
| Storage migration breaks on the owner's only device | a launch after a version bump lands in read-only mode | Migration fixture test first; export-before-migrate; read-only plus export, never a repair attempt |
| Scope creep from "nice" features | any request outside `product-requirements.md` | Add it to that document as `P1`/`OUT` before any code |
| Review workload explodes | a unit exceeds ~400 lines | Split it; the phase does not close |

---

## 9. Not planned

Recorded so that their absence is a decision, not an oversight.

- **Native iOS app.** Dropped with its platform: weekly re-signing or an annual fee,
  plus a Mac that cannot run a compatible Xcode (ADR-0001).
- **watchOS companion.** A web app cannot run on watchOS; no watch transport, no
  wrist logging, no haptic alerts (ADR-008, retired).
- **HealthKit integration.** No web API exists; body weight is manual and sleep, HRV
  and resting heart rate are not inputs. The optional Shortcuts import (F8) is a
  bridge, not an integration.
- **Cross-device sync, CloudKit or any sync service.** It would need a backend; the
  versioned export is the migration path (S5, Q-3).
- **Backend, accounts, passwords.** None.
- **Push notifications, reminders, background sync.** Push exists on iOS 16.4+ for
  installed web apps and is still not used: no streaks, no nudges (non-goal).
- **App Store distribution.** No listing, no review, no signing.
- **Social features, gamification, leaderboards.** Non-goals.
- **Subscriptions or any recurring cost.** S1.
- **Nutrition, running and cycling analytics, medical or injury screening,
  AI-generated coaching text.** Out of scope by the product requirements.
