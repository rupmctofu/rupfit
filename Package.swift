// swift-tools-version: 5.9
import PackageDescription

// RupfitCore is the only module that builds without Xcode. It must stay free of
// SwiftUI, SwiftData, HealthKit and WatchConnectivity (architecture.md §2), which
// is why the platforms below are the floor, not the target.
let package = Package(
    name: "RupfitCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v13)
    ],
    products: [
        .library(name: "RupfitCore", targets: ["RupfitCore"])
    ],
    targets: [
        .target(name: "RupfitCore"),
        .testTarget(name: "RupfitCoreTests", dependencies: ["RupfitCore"])
    ]
)
