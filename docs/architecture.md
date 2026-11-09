# Rupfit — Architecture

Status: designed, not implemented. Nothing here has been run on a device yet. The
platform is an offline-first PWA built on Windows and installed from Safari to the
iPhone Home Screen; the decision and its costs are in
`docs/adr/0001-pwa-instead-of-native-ios.md`. This document states intent and the
rules a reviewer can check; it makes no claim that a build exists.

---

## 1. Design constraints

1. **Local first; the server is a mirror, never a step.** All durable state lives in
   this origin's IndexedDB, and every action completes against it. Since ADR-0002 an
   account and a Supabase mirror exist, but they sit *behind* the local write: a
   screen never waits for, nor reads from, the network to train. A device with no
   account keeps working exactly as it did before.
2. **Offline is still the operating mode.** The network is used for the first
   install, a new version, and the sync pass that runs after a local write — never in
   an action path (§6, ADR-0002).
3. **The progression engine must be testable without a browser.** It is pure
   TypeScript over plain data. A wrong recommendation is silent and damaging, and
   it must be verifiable in Node, on Windows, in CI.
4. **Persistence must never be the model.** IndexedDB is an adapter behind a port,
   so the engine never imports it and the storage can be replaced or faked.
5. **Dependencies are a closed list.** NFR-8 is a closed, reviewable runtime list
   (§3.3: `react`, `react-dom`, `idb`, `zod`) and nothing else. The list is amended
   in NFR-8, enforced in review, and compared against `package.json` in CI (§13).
6. **TypeScript in strict mode, immutable domain values.** No `any` in the domain
   or the engine; domain types are `readonly` and functions return new values.
7. **Every step runs on Windows.** No phase, test or release step may require
   macOS, Xcode, a paid account or a signed binary (ADR-0001 §6).

---

## 2. The platform we actually have

### 2.1 Install contract (spec S1, S2)

What the owner does: open the HTTPS URL **in Safari** (not from a link inside
another app — an in-app browser has no "Añadir a pantalla de inicio"), tap
*Compartir*, tap *Añadir a pantalla de inicio*, confirm. One time.

What that gives:

| Property | Value |
| --- | --- |
| Icon and name | The app's own icon and name on the Home Screen |
| Launch | `display: standalone` — no URL bar, no browser chrome, own entry in the app switcher |
| Cost | Zero. No Apple Developer Program, no TestFlight, no subscription |
| Expiry | None. There is no signature to expire and nothing to re-install |
| Storage | Its own storage container, separate from the Safari tab container |
| Updates | Delivered by the service worker on the app's own terms (§8) |

What it does not give, and must not be described as giving:

- **No programmatic install.** Safari does not implement `beforeinstallprompt`.
  The app cannot trigger the install sheet; it can only explain the two taps and,
  after the fact, detect that it is running installed (§2.1.1).
- **No store presence.** No listing, no review, no App Store updates.
- **No signature, therefore no revocation, but also no trust anchor.** The owner's
  trust is "I deployed this URL", nothing more.

#### 2.1.1 Detecting the installed state

```ts
export function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}
```

Two sources because iOS has historically answered through the Apple-specific flag
and through the display-mode media query depending on version. The app treats the
answer as advisory: behaviour never differs in a way that could break a working
install, and the manifest, the Apple meta tags and the media query all agree by
construction (§8).

### 2.2 Constraints the design must live with

Every row is either documented by Apple/WebKit, observed, or explicitly uncertain.
Uncertain rows are measured on the owner's iPhone in the phase that depends on them
(F5 for the export paths, F6 for install and platform behaviour) and the result is
written into `docs/environment.md`; until then the app must be safe if the
pessimistic reading is true.

| # | Constraint | Confidence | Consequence for the app |
| --- | --- | --- | --- |
| P-1 | On iOS every browser is a WebKit shell; there is no alternative engine to fall back to. | documented | One engine to test — and no second engine to blame. A WebKit bug is the app's bug until proven otherwise. |
| P-2 | No background sync. `SyncManager` and periodic background sync are not available in Safari. | observed | Nothing is queued for later delivery. Every write is local and completes in the same interaction (§6). |
| P-3 | Web Push exists only for web apps installed to the Home Screen, and only from iOS 16.4 onwards. | documented by Apple | Push is not planned (§10.3). Nothing depends on it, so the limit costs nothing. |
| P-4 | No background execution. A backgrounded app is suspended, a service worker may be terminated, and timers do not run reliably. | documented | The rest timer is derived from stored timestamps, never from a running countdown (data-model §7). This is a design property, not a workaround. |
| P-5 | No haptic feedback API reachable from web content (`navigator.vibrate` is not implemented in iOS Safari). | observed | The design system must not promise haptics. Confirmation feedback is visual. |
| P-6 | No Web Bluetooth, no WebUSB, no NFC. | documented | No heart-rate strap, no smart scale. Body weight is manual. |
| P-7 | No HealthKit and no web equivalent. | documented | Health data is out of scope (§10.1). |
| P-8 | Storage can be evicted. Safari applies a seven-day cap to script-writable storage for sites that are *not* added to the Home Screen, and an installed web app is exempt from that cap; the exemption is not a guarantee of permanence. WebKit does not implement `navigator.storage.persist()`, so the app cannot ask to be made persistent. | partially documented; the absent API matches `product-requirements.md` §3.1 and is re-checked in F6 | Installing to the Home Screen is the only protection available from inside the app. The export is the only durable copy, and the app never treats local storage as permanent (§2.3). |
| P-9 | The app can be killed at any instant: lock screen, task switch, low memory, iOS update. | guaranteed | Every confirmed set is committed in its own transaction before the UI reports it confirmed (I-12). |
| P-10 | There is no way to write a file into a folder of the user's choosing. An export leaves through a download or the share sheet. | observed | The export offers a download first, the share sheet with the file second, the clipboard last (data-model §9). Which of the three works inside a standalone web app on this iOS version is uncertain and is measured in F5. |
| P-11 | `beforeinstallprompt` does not exist; installation is a user gesture in Safari's UI. | documented | Install instructions are copy, not code (§2.1). |
| P-12 | The status bar cannot be removed, only styled (`apple-mobile-web-app-status-bar-style`). With `black-translucent` the app draws under it and must pad by the safe-area inset. | documented | `viewport-fit=cover` plus `env(safe-area-inset-*)` on the shell. The design system owns the numbers; this document owns the viewport meta. |
| P-13 | `100vh` on iOS does not mean the visible height while the toolbars collapse. | observed | The shell sizes from `100dvh` where supported and never from `100vh`. |
| P-14 | Screen sleep. Screen Wake Lock exists in Safari 16.4 and later, but it can be refused, dropped or unavailable, and it is not part of the app's contract. | documented; per-call behaviour verified in F6 | The session must survive the screen locking and being reopened: state is in storage, the rest timer is derived from timestamps. A wake lock, where granted, is an enhancement — never a dependency. |
| P-15 | IndexedDB has no cascade deletes, no foreign keys, no check constraints, no query language, and `durability: 'strict'` is not consistently implemented. | documented / uncertain where noted | Invariants are enforced in repository code inside single transactions, and every one has a test (data-model §6). The commit point is the transaction's `complete` event, not a durability promise. |
| P-16 | iOS updates change behaviour of installed web apps without notice. | guaranteed | The platform table is re-verified at F6 and after any iOS major update; the app degrades to "still works, fewer enhancements". |

Nothing in this table is a reason to add a feature. It is the envelope the product
has to fit in, and where the envelope is uncertain the app chooses the safe reading.

### 2.3 Storage: what protects the data

- The origin's IndexedDB is the only durable store. It belongs to the browser:
  uninstalling the web app, clearing website data, or resetting Safari deletes it.
  There is no backup outside the export.
- `navigator.storage.persist()` is probed once, on first successful launch, and the
  answer is recorded in the `meta` store. As of `product-requirements.md` §3.1,
  WebKit does not implement it, so the expected answer is "not available" and the
  app draws no conclusion from it: it does not grant itself a durability guarantee
  the browser will not give. If a later iOS version exposes it, the probe is the
  only thing that changes.
- When persistence is unavailable or denied, `Perfil` shows one advisory line
  recommending an export. It is not a modal, it is not repeated every launch, and
  it never blocks training.
- `navigator.storage.estimate()` is used for an advisory usage figure where
  available. It is a hint, not a quota oracle.
- `localStorage` is not used for durable data: it shares the same eviction rules,
  holds less, and blocks the main thread.
- Quota exhaustion is a transaction failure, not a partial write: the transaction
  aborts whole and the write is reported as failed (I-12, §11).
- Multi-context access is real — a Safari tab and the installed app can both be
  open. IndexedDB serialises transactions over the same object stores across
  connections, so the invariants that must not race are enforced *inside* one
  read-write transaction rather than by a check followed by a write (§7, I-9).

---

## 3. Stack proposal (spec S3)

### 3.1 The choices

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | The compiler is the only safety net that runs before the browser does. |
| Build and dev server | Vite | Fast dev loop, ESM, static output, no native dependencies, works on Windows without a toolchain install. |
| UI | React (`react`, `react-dom`) | §3.2 |
| Manifest and service worker | `vite-plugin-pwa` (Workbox) | Generates the manifest and a versioned precache from the real build output; hand-maintaining a cache list is how offline apps break silently. |
| IndexedDB access | `idb` (~1 kB) | A promise and transaction wrapper. Promise plumbing around `IDBRequest` is exactly the code where transaction edge cases hide; a reviewed 1 kB is better than 200 hand-written lines. |
| Schema validation | `zod` | The import document is the only defence against data loss on a phone change. Types are derived from the schema (`z.infer`), so the validator and the type cannot drift. |
| Tests | Vitest, `fake-indexeddb` | Unit and integration tests in Node, on Windows, with no browser and no simulator. |
| Charts | none — hand-written SVG | ADR-006. Charting libraries are hundreds of kB for four chart shapes, and the design system constrains them to direct labels and no decoration. |
| Hosting | GitHub Pages, HTTPS, optional custom domain | §9 |
| Formatting, typecheck | Prettier, `tsc --noEmit` | CI checks, no runtime cost. |

Rejected with reasons: **Dexie** (a query layer and ~100 kB for a schema of nine
stores), **Tailwind or any CSS framework** (the design system owns its tokens; a
generated class vocabulary fights it), **a state library** (`useReducer` plus the
core's pure transitions is the whole state model), **a meta-framework** (Next,
Remix, SvelteKit: there is no server, no SSR and no route tree beyond four tabs —
and their absence removes the only plausible place where a network request could
enter the render path), **MSW/Playwright in the MVP** (§12), **any analytics or
error-reporting SDK** (no telemetry, S5).

### 3.2 Why React, in one paragraph

The UI is small, stateful and single-job: a paged exercise card, a decision bar, a
list of set rows and a rest bar, all driven by one session state machine. React's
model — a pure render of explicit state — matches that exactly, and it puts the
logic that must be right in the reducer (a pure function in `src/core`, tested in
Node) rather than in component lifecycles. It is chosen for reviewability rather
than novelty: it has the largest body of TypeScript-typed public knowledge, so a
failure is most likely ours and not the framework's; its rendering behaviour for a
paged card and a fixed set list is predictable; and it adds no build machinery
beyond Vite's React plugin. Preact would save roughly 35 kB over the wire, which is
irrelevant for an app whose shell is downloaded once and then cached forever;
Svelte and Solid would trade that size for a compiler and a smaller pool of
reviewable patterns; Lit would push state and component plumbing back into
hand-written code. The choice is revisitable at F4 if the shell's measured parse
time threatens NFR-1; it is not revisitable mid-phase.

### 3.3 Runtime dependency set (the closed list)

- `react`, `react-dom`
- `idb`
- `zod`
- `@supabase/supabase-js` — auth and the remote mirror only, added by owner gate in
  ADR-0002. It is imported by `src/cloud` and by nothing else; `src/storage` and
  `src/core` never see it. Cost is measured in the build and recorded below.

Build and development only: `typescript`, `vite`, `@vitejs/plugin-react`,
`vite-plugin-pwa` (and its Workbox packages), `vitest`, `fake-indexeddb`,
`prettier`, `@types/react`, `@types/react-dom`.

Adding a runtime dependency requires editing this list in the same commit, with one
sentence of justification and the gzip size it adds to the cached shell.

**Resolved: NFR-8 is this closed list.** `product-requirements.md` NFR-8 originally
read "zero third-party runtime dependencies: no UI framework, no charting library, no
web fonts". The owner amended it to a closed list: Rupfit ships the four runtime
packages above and nothing else — no CSS framework, no charting library, no
state-management library, no meta-framework, no web fonts, no analytics, no runtime
network dependency. Adding one requires an ADR and an owner gate. The charting and
web-font prohibitions survive unchanged: charts are hand-written SVG and the type is
the platform's own.

React stays, and the reason is review cost rather than preference. This is a
five-screen app owned by one person: hand-built DOM factories over the same reducer
would add code to review and to get wrong, not less, and they would remove the focus
and accessibility plumbing this plan has no other source for.

The rejected exit is recorded so it is not re-litigated: dropping React for
`createElement` factories costs roughly a week of shell work plus the ecosystem
knowledge that makes a WebKit failure easier to attribute. The pivot to a web
platform is recorded in `docs/adr/0001-pwa-instead-of-native-ios.md`; the dependency
decision is recorded here and in NFR-8.

---

## 4. Modules and boundaries

```
                 ┌───────────────────────────────────────────┐
                 │                src/app                    │  composition root
                 │  routes · shell · container (wiring)      │
                 └───┬──────────────┬─────────────┬──────────┘
                     │              │             │
        ┌────────────▼──────┐ ┌─────▼───────┐ ┌───▼────────────┐
        │ src/design-system │ │src/features │ │   src/pwa      │
        │ tokens · comps    │ │ views +     │ │ sw registration│
        │                   │ │ store       │ │ update · install│
        └───────────────────┘ └─────┬───────┘ └────────────────┘
                                    │ ports (interfaces only)
                          ┌─────────▼──────────┐
                          │    src/storage     │  IndexedDB adapters
                          │ db · records · map │  backup codec
                          │ repositories       │  migrations
                          └─────────┬──────────┘
                                    │
                          ┌─────────▼──────────┐
                          │      src/core      │  pure TypeScript
                          │ domain · engine    │  no DOM, no React,
                          │ statistics · state │  no IndexedDB, no fetch
                          │ ports · seed       │
                          └────────────────────┘
```

**Dependency rule (enforced in review and by `tools/check-boundaries.mjs` in CI):**

| Module | May import | Must never import |
| --- | --- | --- |
| `src/core` | nothing outside itself | `react`, DOM globals, `src/storage`, `src/features`, `src/app`, `src/pwa`, `fetch` |
| `src/storage` | `src/core`, `idb`, `zod` | `react`, `src/features`, `src/design-system`, `src/app` |
| `src/features` | `src/core` (including its ports), `src/design-system`, `react` | `src/storage` adapters, `src/pwa`, `fetch` |
| `src/design-system` | `react` | `src/core/engine`, `src/storage`, `src/features`, `src/app` |
| `src/pwa` | browser APIs only | `src/core`, `src/storage`, `src/features`, `react` |
| `src/app` | everything | — |

A feature folder may not import another feature folder. Shared UI lives in
`src/design-system`; shared logic lives in `src/core`.

**The pure group today.** The group exists as real directories, not as a planned
prefix: `src/core/domain` (value types, entities, invariants) and `src/core/engine`
(`recommend`, `evaluateBlock`, rounding, reason codes, confidence), with
`src/index.ts` as the barrel that re-exports both. The statistical and session
aggregates of the layout in §5 join them as siblings under `src/core/`, and the
boundary script lists them by name. Reorganising files *within* `src/core/` needs no
ADR as long as the row above still holds: no import under `src/core/**` may reach
`react`, a DOM global, `src/storage`, `src/features`, `src/app` or `src/pwa`, and no
file there may touch `fetch`, `Date.now()` or randomness.

**Why `src/core` is a folder and not a separate workspace package:** one install,
one build, nothing published, no resolution aliases. A workspace would add
`package.json#workspaces` and a second build graph to protect a boundary the
`tools/check-boundaries.mjs` script already verifies. The boundary is the point;
the package is not.

The engine stays a pure function:

```ts
export function recommend(input: ProgressionInput): ProgressionRecommendation;
```

Same input, same output: no clock, no I/O, no randomness, no `Date.now()`. Time and
identity are injected (`Clock`, `IdProvider`) so tests pin them.

---

## 5. Repository layout

```
package.json                # scripts: dev, build, preview, test, typecheck, check:boundaries
tsconfig.json               # strict
vite.config.ts              # Vite + VitePWA (manifest, precache, navigateFallback)
index.html                  # viewport meta, apple-mobile-web-app-*, theme-color
public/
  icons/                    # 180, 192, 512 (maskable), favicon
src/
  index.ts                  # public barrel: re-exports core/domain and core/engine
  core/
    domain/                 # value types, entities, invariants
    engine/                 # recommend(), evaluateBlock(), rounding, reason codes
    statistics/             # volume, hard sets, e1RM, records, weekly aggregates
    session/                # session state machine, transitions, crash recovery
    ports/                  # Repository, Clock, IdProvider, StorageInfo interfaces
    seed/                   # the exercise library (typed data, no UI)
  storage/
    db.ts                   # openDatabase(): schema version + migration steps
    records.ts              # flat persisted record types
    mappers.ts              # record <-> domain, both directions
    repositories/           # ExerciseRepository, SessionRepository, ProfileRepository, ...
    codec/                  # backup document, zod schemas, import validation
  features/
    home/ train/ session/ progress/ profile/
  design-system/
    tokens.ts  components/
  pwa/
    register.ts  update.ts  install.ts  share.ts
  app/
    main.tsx  App.tsx  container.ts  routes.tsx
tools/
  check-boundaries.mjs      # the dependency rule, executable
tests/                      # integration tests that need a database or several modules
docs/
```

Unit tests are co-located as `*.test.ts` next to the code they cover. Tests that
need a database, a codec round trip or more than one module live in `tests/`.
`vitest` runs both in the `node` environment; the storage tests import
`fake-indexeddb` in their setup file.

---

## 6. Data flow, and why no UI action awaits the network

```
Component (pure render of props)
  └─ Feature store (useReducer)                session-scoped view state
      └─ Command (src/core)                    pure transition: (state, event) → state + effects
          ├─ src/core                          training rules, statistics, formatting of values
          └─ Port (interface)                  Repository / Clock / IdProvider
              └─ Adapter (src/storage)         the only asynchronous edge in the app
```

Rules:

- A component never opens a database, never calls `fetch`, never reads `Date.now()`.
- A feature store contains no training rule; it dispatches a command.
- A command is pure: it returns the next state plus a list of effects. It performs
  no I/O. The store applies the effects through the ports.
- An adapter returns **domain types**, never IndexedDB records.
- The only place a network API may appear is `src/pwa/` (the service worker's own
  lifecycle), and the UI never observes it.

There is no network in an action path because there is no network code outside
`src/pwa/`. Confirming a set is: pure transition in memory → one IndexedDB
transaction over `sets`, `exerciseSessions`, `sessions` → wait for `complete` →
re-render. The worst case is a few milliseconds of local I/O; NFR-2's budget is met
by construction, not by a spinner. `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`
and `EventSource` are forbidden outside `src/pwa/`, and the boundary check fails the
build if one appears.

The two moments the network exists at all:

1. **First visit.** `index.html`, the assets and the service worker are fetched.
   After the worker activates, the shell is served from the cache.
2. **Update check.** The browser revalidates the service worker script on
   navigation, and the app may ask for a check when it is brought to the
   foreground. It is invisible to the user, it never blocks, and a failure changes
   nothing (§8).

Airplane mode is therefore the expected state of the app, not a degraded one. A
cold launch offline goes: cached shell → open IndexedDB → read the next session →
render. That is also the path the F6 gate tests.

---

## 7. Persistence boundary

`src/storage` owns the database. The rest of the app knows only these ports:

```ts
export interface ExerciseRepository {
  all(): Promise<readonly Exercise[]>;
  byId(id: Uuid): Promise<Exercise | undefined>;
  save(exercise: Exercise): Promise<void>;
}

export interface SessionRepository {
  nextScheduledOnOrAfter(date: EpochMs): Promise<WorkoutSession | undefined>;
  inProgress(): Promise<WorkoutSession | undefined>;
  confirmSet(sessionId: Uuid, exerciseSessionId: Uuid, set: SetRecord): Promise<WorkoutSession>;
  finish(sessionId: Uuid, status: SessionStatus, at: EpochMs): Promise<WorkoutSession>;
}

export interface Clock { now(): EpochMs }
export interface IdProvider { next(): Uuid }
```

- Records are flat and denormalised; mappers convert record ↔ domain in both
  directions and both directions are unit-tested.
- The commit point for a confirmed set is `IDBTransaction.complete`. The UI reports
  the set as confirmed only after that promise resolves (I-12). If the transaction
  aborts, the set stays unconfirmed and a retry banner appears; the app never
  reports a success it did not persist.
- Writes that must not race are one transaction each, with the guard *inside* the
  transaction (I-9: at most one session `inProgress`).
- Deletes are explicit and transactional: a session delete removes its exercise
  sessions and their sets in the same transaction, because IndexedDB has no
  cascade (I-1).
- Statistics never write. They are pure functions over records read through
  indexes, computed on demand.

Details of the schema, keys, indexes, migration steps and the backup document are in
`docs/data-model.md` §5 and §9.

---

## 8. Service worker, cache and update

- `vite-plugin-pwa` in `generateSW` mode: precache every build asset, versioned by
  the build hash; `navigateFallback: 'index.html'`; no runtime caching of foreign
  origins, because there are none.
- **Registration type is `prompt`, never `autoUpdate`.** Replacing the shell under a
  running session is the one update that is indistinguishable from a bug, even
  though the session itself is durable in storage.
- When a new worker is waiting, the app shows a non-blocking banner: a new version
  exists and will be applied on the next cold start, with an explicit *Actualizar
  ahora* action that is refused while a session is in progress.
- `skipWaiting` is not called on install. The new worker activates on the next cold
  start, or when the user accepts the prompt with no session running.
- A failed update must leave the old shell working: the previous precache stays
  until the new worker activates, and a registration error degrades to "the app
  still runs, the update did not arrive" — an advisory line in `Perfil`, not an
  error dialogue.
- Accepted consequence: the first launch after a deploy can run the previous
  version. That is a deliberate trade for never swapping code mid-session, and the
  banner exists so it is not silent.
- The manifest sets `display: standalone`, `start_url`, `scope`, `name`,
  `short_name`, `theme_color`, `background_color` and maskable icons.
  `index.html` *also* carries `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-title` and `apple-mobile-web-app-status-bar-style`. Both
  are emitted because iOS has answered to the Apple meta tags for longer than it
  has read the manifest, and the exact split on the installed iOS version is
  uncertain (§2.2 P-12); emitting both removes the bet rather than guessing it.
- `Perfil` shows the build stamp (short commit hash and build date) so the owner
  can tell which version is installed. Without it, "the update did not arrive" is
  indistinguishable from "the fix did not work".

---

## 9. Install, release and hosting (spec S1)

- **Hosting:** GitHub Pages, serving the built `dist/` from the repository. HTTPS is
  provided by the host (a secure context is mandatory: a service worker and install
  both require it). A custom domain is optional and, if used, is a `CNAME` plus DNS
  records; the app works identically on the default `*.github.io` URL.
- **Why not another host:** Cloudflare Pages, Netlify and Vercel all work and all
  add an account, a second place where the truth lives, and build minutes. GitHub
  Pages needs no new account and no new credential. It is revisited only if header
  control (strict CSP, immutable asset caching) ever becomes necessary, which is
  recorded as a risk rather than assumed.
- **Base path:** GitHub Pages serves a project site under `/<repository>/`, so
  `base` in `vite.config.ts`, `start_url` and `scope` must agree on that prefix.
  This is decided once when the first preview is published (F4), recorded in
  `docs/environment.md`, and verified by the F6 install checklist — a wrong base
  path produces an app that installs and then fails offline, the worst failure
  shape available.
- **Release:** merge to `main` → CI checks → build → publish. No manual upload, no
  signing, no review, no expiry. Releasing is a merge.
- **Rollback:** revert the commit and redeploy. Devices keep running the cached
  previous shell until they accept the new worker, so a bad deploy is not instantly
  fatal.
- **Preview for device review:** before the install contract exists, the shell is
  reviewed on the phone through a static preview over HTTPS, published to this
  repository's GitHub Pages from a preview branch by hand (F4 gate). It is a
  deliberate exception, scoped to review: no manifest, no service worker, no claim
  of installability. The install contract is F6's deliverable, and the automated
  deploy replaces the manual publish there.
- **No analytics, no error reporting, no telemetry** (S5). A production failure is
  diagnosed by the owner with the build stamp, the browser's own console if opened
  on a desktop, and the export.

---

## 10. Platform integrations

### 10.1 Apple Health — not planned, and why (spec S4)

There is no web API that reads Apple Health data in Safari, and a web app cannot
hold the HealthKit entitlement. This is not a missing tool that a library can
provide; the data simply has no path into a browser.

What that costs, stated once and not softened:

- Body weight is typed by the owner in `Peso corporal`. The daily series and the
  seven-day mean work exactly as specified (data-model §8); only the source is
  manual.
- There is no sleep, HRV, resting heart rate or step data. Nothing in the MVP
  required it: the engine cannot see recovery signals at all (ADR-007,
  progression-engine §2), and recovery context was advisory-only presentation.
  Every flow must work with zero health data, which is now the only possibility
  rather than a tested branch.
- `Provenance` keeps its three-way distinction (imported / manual / estimated) so
  that a value's origin is never ambiguous later (data-model §3).

**The optional bridge (later, P1).** iOS Shortcuts can read Apple Health and write
a file. A shortcut can therefore produce a JSON document that the owner imports
through the app's normal import path. The contract that keeps this honest:

| Rule | Reason |
| --- | --- |
| It is an import, not an integration | The app never talks to Health, never requests a permission, never polls. |
| Same document shape, same validator | One import path, one set of rules, one set of tests (data-model §9). |
| Every row carries `provenance: 'imported'` and an `externalSampleId` | Provenance stays visible; re-importing the same sample never duplicates (I-11). |
| Import mode is `merge` for activities and measurements only | A bridge import must never replace training history; `restore` remains the only replace mode and stays explicit. |
| The app works if the bridge never exists | It is F8, optional, and dropping it costs nothing already built. |
| Sleep, HRV and resting heart rate are never required inputs | Spec S4. They may decorate a screen, they never reach the engine. |

Uncertain, and treated as such: which Health values a given Shortcuts action can
read on the owner's iOS version, and whether it can hand a file to the installed app
without an extra manual step. F8 begins by measuring both on the phone and recording
the answer in `docs/environment.md`. If the answer requires hardware, an extra app
or a step the owner will not perform every week, F8 is dropped and the cost stands.

### 10.2 watchOS companion — not planned

A web app cannot run on watchOS, cannot use WatchConnectivity and cannot render on
the watch. The previous plan's `WatchEnvelope` message contract is retired, not
deferred: it existed so that a future watch app would be an implementation rather
than a redesign, and there is no longer a watch runtime to implement.

What is lost: logging a set from the wrist, and haptic rest alerts. What replaces
it: the session lives on the phone, the rest bar is the largest element on the
screen, and the timer is derived from `confirmedAt` so it is correct after the
screen locks and the app is reopened (data-model §7). A wrist interface is not a
phase of this plan; if it ever becomes a requirement it is a new platform decision
with its own cost (ADR-0001 §5).

### 10.3 Push notifications, background sync, reminders — not planned

Web Push exists for installed web apps from iOS 16.4 onwards (P-3), and it is still
not used: there are no reminders, no streaks and no nudges, by non-goal. Background
sync does not exist in Safari (P-2) and nothing is queued, so its absence changes
nothing. A future feature that wanted to reach the owner while the app is closed
would have to justify itself against the product requirements first, and would
inherit P-3's constraint.

---

## 11. Error model

```ts
export type AppError =
  | { kind: 'persistence'; failure: 'open' | 'upgrade' | 'blocked' | 'transaction' | 'quota'; cause?: unknown }
  | { kind: 'import'; failure: 'invalidDocument' | 'unsupportedVersion'; detail: string }
  | { kind: 'conflict'; failure: 'sessionAlreadyInProgress'; sessionId: Uuid }
  | { kind: 'advisory'; failure: 'storageNotPersisted' | 'storageLow' | 'updateFailed' | 'swNotRegistered' };
```

`advisory` failures never interrupt; they render as one line in `Perfil` or as the
existing non-blocking banner.

| Failure | Behaviour |
| --- | --- |
| Database cannot open | App opens read-only: it shows what is reachable, disables writes, offers an export. It never deletes the database. |
| Version upgrade fails or is blocked by another context | Reads the old shape if it can; otherwise read-only with an export action. Writes disabled with an explanation, never a silent no-op. |
| Transaction aborts on set confirm (including quota) | The set stays unconfirmed, the banner offers retry, nothing is partially written. No silent loss. |
| Import document invalid | Reject the whole document, report the first failure with its path, change nothing. |
| Import `schemaVersion` unknown | Reject, name both versions, no best-effort parse. |
| A session is already `inProgress` and another start is attempted | `conflict`; the UI offers the existing session (resume) instead of creating a second one (I-9). |
| Storage not persistent, or estimated usage high | One advisory line, dismissed until the next launch, never a modal. |
| Service worker registration or update fails | The app keeps working from cache; advisory line only. |

No failure may block starting or finishing a workout. Recording a set must work
when browser storage is not persistent, the service worker is stale, the quota is low and
the phone has no signal — which is four conditions that are all true in a gym at
once.

---

## 12. Testing strategy

| Layer | Tool | Runs where | Automated |
| --- | --- | --- | --- |
| `src/core` domain + engine | Vitest (node) | Windows, CI `ubuntu-latest` | yes |
| Statistics fixtures | Vitest (node) | Windows, CI | yes |
| Session state machine + crash recovery transitions | Vitest (node) | Windows, CI | yes |
| Mappers, migration steps, repositories | Vitest + `fake-indexeddb` | Windows, CI | yes |
| Backup document, import validation | Vitest (node) | Windows, CI | yes |
| Shell flow (start → decide load → confirm sets → finish) | manual checklist at the gym | iPhone | no |
| Install, offline cold start, update | manual checklist | iPhone | no |
| Export/import round trip, storage eviction behaviour | manual checklist | iPhone | no |

The automated set covers the irreversible risks: a wrong recommendation, a lost or
corrupted record, a bad import. Browser automation is deliberately absent from the
MVP. Playwright's WebKit build is not the Safari on the owner's phone, so it would
buy confidence in a neighbouring engine while adding a second test toolchain to
keep current. If shell regressions start slipping through the manual checklist, the
first addition is a Playwright WebKit smoke test of the session flow — recorded as a
risk response in `docs/roadmap.md` §8, not assumed here.

Every manual checklist produces a line in `docs/environment.md` with the date, the
iOS version and the result. "Works on my phone" is not a test result; "iOS version
recorded, installed from Safari, airplane mode, cold start, 1.8 s to the session
screen, 3 sets logged, killed and resumed at set 4" is.

---

## 13. CI

```yaml
# intended shape, created in F0
jobs:
  check:
    runs-on: ubuntu-latest
    steps: npm ci → npm run typecheck → npm run check:boundaries → npm run test → npm run build
  deploy:
    runs-on: ubuntu-latest        # main only, needs check
    steps: build → publish dist/ to GitHub Pages
```

- `npm run check:boundaries` runs `tools/check-boundaries.mjs`, which scans import
  specifiers per folder and fails on a forbidden edge. Rules that only live in a
  document are rules that decay.
- The same script compares `package.json` runtime dependencies against the closed
  list in §3.3 and fails on a mismatch, so the list cannot rot silently.
- `npm run build` fails on a type error, so a broken type never reaches a phone.
- **No macOS runner and no Xcode step anywhere.** If a job needs one, the change is
  wrong (ADR-0001 §6).
- No secrets are required except the host's own deployment token, which is scoped
  to this repository.

---

## 14. Decision log

The pivot itself is recorded in `docs/adr/0001-pwa-instead-of-native-ios.md`. The
entries below keep the identifiers other documents already cite (ADR-006 is cited by
`design-system.md`, ADR-007 by `progression-engine.md`); Swift-specific entries are
marked retired rather than renumbered, so a reader arriving from an old reference
finds the history instead of a dangling number.

| ID | Decision | Alternative rejected | Status |
| --- | --- | --- | --- |
| ADR-0001 | Offline-first PWA installed from Safari, built on Windows | Native iOS app with a free or paid Apple account | Accepted 2026-11-08 |
| ADR-001 | The domain and engine are a framework-free TypeScript module (`src/core`), testable in Node | Engine inside components — untestable without a browser | Active (amended: TypeScript module, not a Swift package) |
| ADR-002 | Domain types plus flat records with explicit bidirectional mappers | Using the stored record as the domain, or the domain object as the record — couples the engine to storage | Active |
| ADR-003 | No Apple Health integration; an optional Shortcuts import bridge feeds the normal import path | Direct HealthKit or any automatic health read — no web API exists, no entitlement is possible | Replaced |
| ADR-004 | The build tool is Vite and its config is committed | Generated project files — no generator, nothing to regenerate | Retired |
| ADR-005 | The recommendation is frozen at session start | Recomputing from latest data — destroys the record of what was shown | Active |
| ADR-006 | No third-party runtime dependencies beyond the list in §3.3; charts are hand-written SVG | Chart library, CSS framework, state library — supply-chain and bundle cost for no gain | Amended |
| ADR-007 | Recovery signals never enter the engine | Adaptive load from HRV/sleep — non-deterministic, untestable, forbidden by FR-13.3 | Active |
| ADR-008 | No watch app, no watch transport contract | Deferring a watch app to P1 with a message contract written now — no watch runtime can implement it | Retired |
| ADR-009 | Metric canonical storage, imperial display-only | Storing user units — rounding drift and migration pain | Active |
| ADR-010 | Spanish UI copy, English code and documents | All-Spanish — code identifiers and review vocabulary in a second language | Active |
| ADR-011 | Additive-only schema migration policy, versioned from v1 | Destructive reset — the store is the owner's only training history | Active |
| ADR-012 | Service worker updates are prompt-based and never `skipWaiting` under a running session | `autoUpdate` — swapping the shell mid-set is indistinguishable from data loss | Accepted |

---

## 15. Known risks

| Risk | Trigger to act | Mitigation |
| --- | --- | --- |
| Safari evicts the storage container and the training history is gone | a launch shows an empty store, or `estimate()` is near the quota | Install to the Home Screen (P-8) — the only protection the platform offers — keep the export cheap and the backup reminder in `Perfil`; the export is the only real recovery. |
| A WebKit behaviour differs from what this document assumes | F6 checklist contradicts §2.2 | Measure on the phone, write the result in `docs/environment.md`, adjust the design; never claim the assumed behaviour afterwards. |
| Wrong base path or scope produces an app that installs and then fails offline | F6 install checklist | Decide `base`/`start_url`/`scope` once, test in airplane mode, record it. This is the failure shape that looks like success. |
| A bad deploy bricks the cached shell | owner reports the app opens to a white screen offline | Prompt-based updates keep the previous precache until activation; rollback is a revert plus redeploy; the update banner keeps it visible. |
| Loss of evidence on the device: no screenshot testing, no automated UI run | a shell regression reaches the phone twice | Manual checklist at each gate, and Playwright WebKit as the first addition if it repeats. |
| Review workload from a large first implementation | a unit exceeds ~400 changed lines | Phase gates and work units (roadmap §5); the phase does not close with an oversized unit. |
| A dependency is added casually and the closed list rots | an `npm install` with no entry in §3.3 | The boundary/CI check reads `package.json` against the documented list and fails on a mismatch. |
| The engine is written only after a UI exists | any urge to "just hardcode it in the component for now" | F3 comes before any screen (roadmap), and the engine has no access to the DOM to make the shortcut possible. |
| A second context (Safari tab plus installed app) holds two sessions | the app reports a `conflict` on start | I-9 is enforced inside one transaction, so the second writer loses; the UI offers resume rather than creating a parallel session. |
