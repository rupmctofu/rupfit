import XCTest
import RupfitCore

final class CoreLinkTests: XCTestCase {
    /// Proves the generated project really links the local package. If the path or
    /// the product name in `project.yml` is wrong, this fails before any feature
    /// depends on it.
    func testAppTargetLinksTheLocalPackage() {
        XCTAssertFalse(RupfitCore.engineVersion.isEmpty)
    }
}
