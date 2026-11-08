import XCTest
@testable import RupfitCore

final class StatisticsTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_760_000_000)
    let prescription = ExercisePrescription(sets: 3, repRange: 6...10, targetRIR: 1...3, restSeconds: 180)

    func set(_ weight: Double, _ reps: Int, effort: Effort?, daysAgo: Double = 0) -> SetRecord {
        SetRecord(index: 1, weightKg: weight, targetReps: 6, actualReps: reps,
                  effort: effort, discomfort: Discomfort.none,
                  confirmedAt: now.addingTimeInterval(-86_400 * daysAgo))
    }

    func session(muscle: UUID?, sets: [SetRecord]) -> ExerciseSession {
        ExerciseSession(order: 1, exerciseID: muscle, exerciseNameSnapshot: "Test",
                        prescription: prescription, recommendation: nil, sets: sets)
    }

    func testSessionVolumeIsWeightTimesReps() {
        let sets = [set(100, 6, effort: .hard), set(100, 5, effort: .correct)]
        XCTAssertEqual(Statistics.sessionVolume(sets), 1_100, accuracy: 0.001)
    }

    func testHardSetsCountOnlyAnsweredNearFailureWithinTheWindow() {
        let squatID = UUID()
        let benchID = UUID()
        let exercises: [UUID: Exercise] = [
            squatID: Exercise(name: "Sentadilla", primaryMuscle: .quadriceps, pattern: .squat,
                              equipment: .barbell, loadIncrementKg: 2.5),
            benchID: Exercise(name: "Press", primaryMuscle: .chest, pattern: .horizontalPush,
                              equipment: .barbell, loadIncrementKg: 2.5)
        ]
        let week = DateInterval(start: now.addingTimeInterval(-86_400 * 7), end: now.addingTimeInterval(60))
        let sessions = [
            session(muscle: squatID, sets: [
                set(100, 6, effort: .hard),
                set(100, 6, effort: .correct),
                set(100, 6, effort: .easy),
                set(100, 6, effort: nil),
                set(100, 6, effort: .failure, daysAgo: 10)   // outside the window
            ]),
            session(muscle: benchID, sets: [set(80, 6, effort: .hard)])
        ]
        XCTAssertEqual(Statistics.hardSets(in: sessions, muscle: .quadriceps,
                                          exercises: exercises, within: week), 2)
        XCTAssertEqual(Statistics.hardSets(in: sessions, muscle: .chest,
                                          exercises: exercises, within: week), 1)
    }

    func testEstimatedOneRepMax() {
        XCTAssertEqual(Statistics.estimatedOneRepMax(weightKg: 100, reps: 5, effort: .hard) ?? 0, 120, accuracy: 0.001)
        XCTAssertNil(Statistics.estimatedOneRepMax(weightKg: 100, reps: 10, effort: .easy),
                     "10 + 3 RIR is beyond the formula's usable range")
        XCTAssertNil(Statistics.estimatedOneRepMax(weightKg: 100, reps: 5, effort: nil),
                     "no effort means no estimate")
        XCTAssertEqual(Statistics.e1RMFormulaVersion, 1)
    }

    func testPersonalRecordUsesHeaviestAndKeepsEarliestDate() {
        let heavier = set(102.5, 6, effort: .hard, daysAgo: 3)
        let lighter = set(100, 6, effort: .hard, daysAgo: 1)
        let tie = set(102.5, 6, effort: .hard, daysAgo: 10)
        let record = Statistics.personalRecord(in: [heavier, lighter, tie], targetReps: 6)
        XCTAssertEqual(record?.weightKg, 102.5)
        XCTAssertEqual(record?.achievedAt, tie.confirmedAt)
        XCTAssertNil(Statistics.personalRecord(in: [set(100, 4, effort: .hard)], targetReps: 6))
    }

    func testSevenDayMeanNeedsThreeSamples() {
        let window = DateInterval(start: now.addingTimeInterval(-86_400 * 7), end: now)
        let two = [(date: now, weightKg: 78.0), (date: now.addingTimeInterval(-86_400), weightKg: 79.0)]
        XCTAssertNil(Statistics.sevenDayMean(samples: two, within: window))
        let three = two + [(date: now.addingTimeInterval(-86_400 * 2), weightKg: 80.0)]
        XCTAssertEqual(Statistics.sevenDayMean(samples: three, within: window) ?? 0, 79.0, accuracy: 0.001)
    }
}
