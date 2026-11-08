/// The pure-Swift domain and progression engine.
///
/// F0 creates the module and its boundary; F3 adds `Domain`, `Engine` and
/// `Statistics`. Nothing here may import SwiftUI, SwiftData, HealthKit or
/// WatchConnectivity (`docs/architecture.md` §2).
public enum RupfitCore {
    /// Single source of truth for the engine rules being implemented.
    ///
    /// `docs/progression-engine.md` §12 is the authority: this number and the
    /// document move together, and the test in `RupfitCoreTests` fails when they
    /// do not.
    public static let engineVersion = "1.1.0"
}
