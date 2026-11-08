import XCTest

@MainActor
final class SmokeUITests: XCTestCase {
    func testSessionSmokeFromStartToSummary() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestSession", "-uiTestReset"]
        app.launch()

        let chooseWeight = app.buttons["Elegir peso"]
        XCTAssertTrue(chooseWeight.waitForExistence(timeout: 15), "the session must open on the weight decision")
        chooseWeight.tap()

        let field = app.textFields["weightField"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("60")
        app.buttons["saveWeight"].tap()

        for index in 1...2 {
            let confirm = app.buttons["confirmSet-\(index)"]
            XCTAssertTrue(confirm.waitForExistence(timeout: 5), "set \(index) must be ready to confirm")
            confirm.tap()
        }

        let finish = app.buttons["finishSession"]
        XCTAssertTrue(finish.isEnabled)
        finish.tap()

        XCTAssertTrue(app.staticTexts["sessionSummaryTitle"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["summarySets"].label.contains("2"))
    }

    func testDecisionBarSurvivesAccessibilityXXXL() {
        let app = XCUIApplication()
        app.launchArguments = [
            "-uiTestSession", "-uiTestReset",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launch()

        let bar = app.otherElements["loadDecisionBar"]
        XCTAssertTrue(bar.waitForExistence(timeout: 15), "decision bar must exist at XXL")
        let choose = app.buttons["Elegir peso"]
        XCTAssertTrue(choose.isHittable, "the primary action must stay reachable at XXL")
        XCTAssertFalse(choose.label.isEmpty, "the action must have a spoken label")
    }

    func testPagerAndSetRowAreAnnounced() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestSession", "-uiTestReset"]
        app.launch()

        XCTAssertTrue(app.staticTexts["sessionPager"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["sessionPager"].label.contains("Ejercicio"), "pager announces position")
        XCTAssertTrue(app.staticTexts["Serie 1, pendiente"].exists
                      || app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'pendiente'")).firstMatch.exists,
                      "the pending set must announce its state")
    }
}
