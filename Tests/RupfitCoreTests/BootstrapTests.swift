import XCTest
import RupfitCore

final class BootstrapTests: XCTestCase {
    /// The only claim F0 can make about the engine: the module compiles and the
    /// rules it implements are the ones the document describes.
    func testEngineVersionMatchesTheSpecification() {
        XCTAssertEqual(RupfitCore.engineVersion, "1.1.0")
    }
}
