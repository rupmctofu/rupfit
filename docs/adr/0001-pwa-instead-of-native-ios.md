# ADR-0001 — Replace the native iOS app with an offline-first PWA

- Status: accepted
- Date: 2026-11-08
- Scope: the platform layer only. This record supersedes the SwiftUI / SwiftData /
  HealthKit / watchOS / Xcode-on-macOS plan. It does not supersede
  `docs/training-science.md`, the progression engine rules or the domain model;
  those survive unchanged in substance (spec S7).
- Supersedes in practice: the retired rows of the decision log in
  `docs/architecture.md` §14 (ADR-003, ADR-004, ADR-008).

---

## 1. Context

The repository was written for a native iOS application: SwiftUI views, SwiftData
persistence, a HealthKit read adapter, a watchOS companion, and a build that starts
with Xcode on macOS. No application code exists yet; the repository is documents,
and the previous roadmap's first phase required a Mac before anything else could
start.

Three facts about the owner's environment then made that plan impossible to execute
as written, and one of them is a product constraint rather than an inconvenience.

## 2. The three constraints that forced the decision

**C-1 — A free Apple account forces a weekly re-sign.**
Installing a self-built app on the owner's own iPhone with a free Apple ID produces
a provisioning profile that expires after seven days. After that the app refuses to
launch until it is re-signed and re-installed from a Mac. A training log that stops
opening every Monday because of a certificate is not a tool; it is a chore.

**C-2 — Removing C-1 costs 99 EUR per year, recurring.**
The Apple Developer Program removes the seven-day limit and enables TestFlight. The
owner rejected the recurring cost explicitly: no subscription, no annual fee, no
account of any kind (spec S1). This is a product requirement, not a budget note.

**C-3 — The machine that would have to run Xcode cannot run a compatible Xcode.**
The available MacBook cannot install a version of Xcode that the plan's toolchain
requires (Swift 6 language mode, a current iOS simulator runtime). Even ignoring
C-1 and C-2, the build path described in `docs/architecture.md` could not have been
executed on the hardware the owner has, and buying both a compatible Mac and a
developer membership is the same recurring cost from the other direction.

C-3 alone is a tooling problem. C-1 and C-2 together rule out the native path
entirely: any signed iOS binary from this project expires, and any permanent one is
paid for annually.

## 3. Decision

Rupfit is built as an **offline-first progressive web app**, developed, tested and
released entirely on Windows, installed once from Safari to the iPhone Home Screen.

Specifically:

- **Delivery.** Static files served over HTTPS from a free static host. No backend,
  no account, no store review, no signing step, nothing that expires.
- **Install.** Safari → Compartir → "Añadir a pantalla de inicio". The result
  launches standalone from its own icon with its own name, keeps its own storage
  container, and keeps working indefinitely (spec S2).
- **Runtime.** TypeScript, Vite, a React shell (the NFR-8 dependency decision is
  recorded, open, in `architecture.md` §3.3), a service worker that precaches the
  app shell, and IndexedDB for all durable state (spec S3, S5).
- **Domain.** `docs/training-science.md`, the progression engine rules and the
  domain model, invariants and session state machine carry over unchanged in
  substance; only the persistence mechanics are re-expressed for IndexedDB (spec S7).
- **Integrations.** No HealthKit, no watchOS companion (spec S4). An optional later
  bridge may read Apple Health through iOS Shortcuts and import a JSON document
  through the normal import path.

The full install contract and the platform's real limits are stated in
`docs/architecture.md` §2; this record only explains why that platform was chosen.

## 4. Alternatives rejected

| Alternative | Why it was rejected |
| --- | --- |
| **A-1 Native app, free Apple account** | Seven-day provisioning expiry (C-1): the app must be re-signed and re-installed weekly from a Mac. It also still requires a compatible Xcode (C-3), so the failure mode is two failures at once. |
| **A-2 Native app, paid Apple Developer Program** | 99 EUR/year, recurring, plus a Mac running a compatible Xcode. Violates S1 directly and does not solve C-3. |
| **A-3 Capacitor (or similar) wrapper plus self-signing** | A Capacitor build is still a signed iOS binary: the web layer is packaged and installed natively, so C-1 and C-3 apply unchanged. Self-signing with a free account reintroduces the weekly re-sign; sideloading through a helper tool adds a weekly refresh step and a device-trust step on top, and building the binary still needs macOS. It converts a browser install into a toolchain the owner cannot maintain. |
| **A-4 TestFlight** | Requires the paid membership (C-2), builds expire (90 days), and producing the build still needs macOS with a compatible Xcode (C-3). TestFlight is distribution for a native binary, not an escape from signing. |
| **A-5 Web app used in a Safari tab, not installed** | No icon, no standalone launch, browser chrome while training, and ordinary browsing storage is the storage the browser is free to evict (architecture §2.2). Installing to the Home Screen is what makes the storage safe and the launch clean; skipping it keeps the platform's costs without its benefit. |

## 5. Accepted costs

These are real losses, accepted with the decision. They are not mitigated by
pretending the platform can do them.

| Loss | What it means in practice |
| --- | --- |
| **No HealthKit** | There is no web API for Apple Health data and a web app cannot hold the HealthKit entitlement. Body weight is typed manually; sleep, HRV and resting heart rate are not inputs to anything. Recovery context, which was advisory-only anyway, is gone until the optional Shortcuts bridge exists. |
| **No watchOS app** | A web app cannot run on watchOS and cannot use WatchConnectivity. Logging a set from the wrist and haptic rest alerts are out. The `WatchEnvelope` message contract is retired, not deferred: there is no watch runtime to implement it in. |
| **No native haptics** | iOS exposes no haptic API to web content (`navigator.vibrate` is not implemented in Safari). Confirmation feedback has to come from pixels the app controls; the design system must not promise a tap on the wrist or a buzz on confirm. |
| **Weaker background execution** | A backgrounded app is suspended and its timers stop, and there is no background sync. The rest timer is therefore derived from stored timestamps rather than counted down (data-model §7), and nothing is ever queued for later delivery. |
| **Manual backup instead of iCloud/CloudKit sync** | There is no automatic cross-device sync and no CloudKit. One phone, one container. Moving to a new phone or recovering from a cleared container is a versioned JSON export plus a validating import (data-model §9), performed by the owner. |
| **Storage owned by the browser** | The container can be evicted in principle (architecture §2.3). Installing to the Home Screen removes the ordinary-browsing eviction rule and is the only protection available; WebKit does not implement `navigator.storage.persist()`, so the app cannot ask for more. The export is the recovery path. |
| **No database engine** | IndexedDB has no cascade deletes, no unique constraints beyond unique indexes, no query language and no schema types. Invariants that a database would have enforced are enforced in repository code inside single transactions and covered by tests (data-model §6). |
| **WebKit is the only engine** | On iOS every browser is a WebKit shell. One engine to test is a benefit; one engine also means a WebKit bug is the app's bug, with no second engine to compare against. |
| **No store presence** | No listing, no review, no automatic updates through the App Store. Updates arrive through the service worker and are applied by the app. |

## 6. Consequences that must keep holding

1. No document may present Swift, Xcode, SwiftData, HealthKit, watchOS or macOS as
   part of the plan (spec S8). Where those technologies appear, they appear as the
   rejected alternative, with the reason.
2. Every phase, test and release step must run on Windows. A step that needs
   `macos-latest` is a defect in the plan, not a runner configuration choice.
3. The install contract is stated honestly: what it gives, what it does not, and
   which limits are uncertain (architecture §2).
4. Nothing that the domain promised is dropped to fit the platform: the invariants,
   the frozen recommendation, the normalisation of the recommendation record and
   the crash-recovery state machine carry over as written (spec S7).
5. The engine stays pure and testable without a browser, because it is now the only
   component whose failure would be silent.

## 7. When to revisit

This decision is reopened if, and only if:

- Apple ships a supported way to install and run a self-built native app without a
  paid membership and without periodic re-signing; or
- the owner accepts a recurring cost, which reopens A-2; or
- WebKit gains the APIs recorded as absent in architecture §2.2 (HealthKit access,
  background sync, haptics) — each of which would remove a named cost above; or
- the owner requires a wrist interface, which cannot be delivered by this platform
  and would be a new platform decision rather than a phase of this one.
