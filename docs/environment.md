# Rupfit — Environment

Status: **F0 closed** on 2026-11-08 — local gates and CI green. Every value below
is pasted output, not a claim.

---

## 1. Machine

```
$ sysctl -n hw.model
MacBookPro14,3
$ sw_vers
ProductName:		macOS
ProductVersion:		13.7.8
BuildVersion:		22H730
$ uname -m
x86_64
```

2017 15-inch MacBook Pro (Intel Core i7-7700HQ). Ventura 13.7.8 is the last macOS
release this model supports: macOS 14 Sonoma dropped it, so Xcode 16 cannot be
installed here under any supported configuration.

## 2. Toolchain, verified

```
$ xcode-select -p
/Applications/Xcode.app/Contents/Developer
$ xcodebuild -version
Xcode 15.2
Build version 15C500b
$ swift --version
swift-driver version: 1.87.3 Apple Swift version 5.9.2 (swiftlang-5.9.2.2.56 clang-1500.1.0.2.5)
Target: x86_64-apple-macosx13.0
$ xcrun simctl list runtimes
iOS 17.2 (17.2 - 21C62) - com.apple.CoreSimulator.SimRuntime.iOS-17-2
$ xcodegen --version
Version: 2.44.1
```

| Item | State |
| --- | --- |
| Xcode | 15.2 (15C500b) at `/Applications/Xcode.app`, signature valid, no quarantine |
| iOS SDK | 17.2 (`iphoneos17.2`, `iphonesimulator17.2`) |
| Simulator runtime | iOS 17.2 (21C62), installed via `xcodebuild -downloadPlatform iOS` |
| Simulator device | iPhone 15 (iOS 17.2) |
| Swift | 5.9.2 |
| XcodeGen | 2.44.1, installed from the release zip with its `SettingPresets` |
| swift-format | not installed locally; the lint job runs it in CI |
| Homebrew | present; Ventura/Intel is Tier 3, so most formulas build from source |
| `gh` | authenticated as `rupmctofu`, scopes include `repo` and `workflow` |
| Git remote | `origin` = `https://github.com/rupmctofu/rupfit.git` |

**XcodeGen pitfall, recorded because it cost a debug cycle:** the current
`brew install xcodegen` refuses to build on Ventura (its formula requires Xcode
15.3). The 2.44.1 release zip works, but the binary alone is not enough — run its
`install.sh` so `/usr/local/share/xcodegen/SettingPresets` exists. Without the
presets, `xcodegen generate` succeeds but emits a project with an empty
`PRODUCT_NAME`, and `xcodebuild test` then fails with `Could not find test host`.

## 3. Decision taken (owner, 2026-11-08): Xcode 15.2 locally

The Mac cannot run Xcode 16. The owner chose **Xcode 15.2 locally** over CI-only
builds and over buying a new machine, and the documents were amended in writing:

| Document | Amendment |
| --- | --- |
| `product-requirements.md` NFR-5 | Swift **5** language mode with `-strict-concurrency=complete`, warnings as errors. |
| `product-requirements.md` D-6 | Deployment target **iOS 17.0** (SwiftData floor); iOS 17.2 SDK and runtime. |
| `progression-engine.md` §11 | Engine tests run on **XCTest**; Swift Testing ships with Xcode 16. |
| `architecture.md` §2, §6, §10 | Same: Swift 5 mode, strict concurrency on, warning = failure in CI, XCTest. |

Rejected: CI-only (keeps NFR-5 but makes F5's owner gym review unreachable without
a signed device build) and a new Apple Silicon Mac (correct long term, hardware
cost today). OpenCore Legacy Patcher is not used.

## 4. F0 verification (local, 2026-11-08)

```
$ swift test -Xswiftc -strict-concurrency=complete -Xswiftc -warnings-as-errors
Build complete! (26.33s)
Test Suite 'All tests' passed
	 Executed 1 test, with 0 failures (0 unexpected) in 0.001 (0.004) seconds

$ xcodegen generate --spec App/project.yml
Created project at /Users/rupmctofu/rupfit/App/Rupfit.xcodeproj

$ xcodebuild test -project App/Rupfit.xcodeproj -scheme Rupfit \
    -destination 'platform=iOS Simulator,name=iPhone 15' CODE_SIGNING_ALLOWED=NO
Test Suite 'CoreLinkTests' passed
	 Executed 1 test, with 0 failures (0 unexpected) in 0.005 (0.009) seconds
** TEST SUCCEEDED **
```

The `SecTaskLoadEntitlements` lines printed by the simulator host are expected with
`CODE_SIGNING_ALLOWED=NO` and do not affect the result.

## 5. CI, verified

```
$ gh run view 42477138093 --json conclusion,jobs
{"conclusion":"success","jobs":[
  {"name":"RupfitCore (Swift 5.9, strict concurrency)","conclusion":"success"},
  {"name":"Format and import boundaries","conclusion":"success"},
  {"name":"App (generated project, simulator)","conclusion":"success"}]}
```

Run: <https://github.com/rupmctofu/rupfit/actions/runs/42477138093>, branch
`f0-bootstrap`, 3 min 9 s. The three jobs follow `architecture.md` §11.

Difference to know about: the macOS job runs on a `macos-15` runner with Xcode 16,
not 15.2, because GitHub no longer offers Ventura images. The project builds in
**Swift 5 language mode** (`SWIFT_VERSION = 5.0`) with strict concurrency, so both
toolchains compile the same source; the iOS simulator there is an iPhone 16 with
iOS 18, while this Mac uses iPhone 15 / iOS 17.2. The tests are the contract, not
the runner.

## 6. Appendix: first install, step by step

```bash
# Xcode 15.2, downloaded from developer.apple.com/download/all (Apple ID required)
shasum -a 1 Xcode_15.2.xip        # 3f1e6943264ba640f83e655768df439902acc406
xip -x Xcode_15.2.xip && mv Xcode.app /Applications/
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
xcodebuild -downloadPlatform iOS  # iOS 17.2 simulator runtime, ~7.4 GB
```

## 7. Append-only log

- 2026-11-08 — first record. Blocked: no Xcode, no simulator.
- 2026-11-08 — owner chose Xcode 15.2 local; NFR-5, D-6 and the test framework
  amended; F0 scaffolding written.
- 2026-11-08 — Xcode 15.2 installed, licence accepted, iOS 17.2 runtime installed,
  XcodeGen 2.44.1 installed; `swift test` and `xcodebuild test` green locally.
