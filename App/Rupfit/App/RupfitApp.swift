import SwiftUI

/// F0 entry point: an app that launches to an empty view, so the project, the
/// simulator and the signing path are proven before any screen exists.
@main
struct RupfitApp: App {
    var body: some Scene {
        WindowGroup {
            EmptyView()
        }
    }
}
