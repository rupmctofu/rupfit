import Foundation

/// Every produced weight is a multiple of the exercise's increment, within 1e-6.
/// Bodyweight (increment 0) never does weight arithmetic.
public enum LoadRounding {
    public static let epsilon = 1e-6

    public static func roundDown(_ value: Double, increment: Double) -> Double {
        guard increment > 0 else { return value }
        guard value > 0 else { return 0 }
        let steps = ((value + epsilon) / increment).rounded(.down)
        return max(0, steps * increment)
    }

    public static func roundUp(_ value: Double, increment: Double) -> Double {
        guard increment > 0 else { return value }
        guard value > 0 else { return 0 }
        let steps = ((value - epsilon) / increment).rounded(.up)
        return max(0, steps * increment)
    }
}
