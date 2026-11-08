import Foundation

public struct PlanItem: Identifiable, Hashable, Sendable, Codable {
    public let id: UUID
    public var order: Int
    public var exerciseID: UUID
    public var prescription: ExercisePrescription

    public init(id: UUID = UUID(), order: Int, exerciseID: UUID, prescription: ExercisePrescription) {
        self.id = id
        self.order = order
        self.exerciseID = exerciseID
        self.prescription = prescription
    }
}

public struct PlanDay: Identifiable, Hashable, Sendable, Codable {
    public let id: UUID
    public var name: String
    /// Calendar convention: 1 = Monday … 7 = Sunday.
    public var weekday: Int
    public var order: Int
    public var items: [PlanItem]

    public init(id: UUID = UUID(), name: String, weekday: Int, order: Int, items: [PlanItem] = []) {
        self.id = id
        self.name = name
        self.weekday = weekday
        self.order = order
        self.items = items
    }
}
