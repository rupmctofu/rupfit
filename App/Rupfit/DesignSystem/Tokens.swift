import SwiftUI

/// Tokens of docs/design-system.md §3–§5. No literal hex or magic number in a view:
/// if a value is not here, it does not exist.
enum RupfitColor {
    static let background = dynamic(light: 0xF7F7F9, dark: 0x101214)
    static let surface = dynamic(light: 0xFFFFFF, dark: 0x171A1D)
    static let raised = dynamic(light: 0xEEF0F3, dark: 0x22262A)
    static let border = dynamic(light: 0xE3E5EA, dark: 0x303438)

    static let textPrimary = dynamic(light: 0x111315, dark: 0xF0F1EB)
    static let textSecondary = dynamic(light: 0x5A6270, dark: 0x92969D)
    static let textTertiary = dynamic(light: 0x6E7787, dark: 0x6F757C)

    static let accent = dynamic(light: 0x4E6A00, dark: 0xB8F34A)
    static let onAccent = dynamic(light: 0xFFFFFF, dark: 0x101214)
    static let accentText = dynamic(light: 0x405700, dark: 0xB8F34A)
    static let accentMuted = dynamic(light: 0xEDF2DB, dark: 0x26301B)

    static let success = accent
    static let warning = dynamic(light: 0x7A5300, dark: 0xE8B85C)
    static let danger = dynamic(light: 0xB3261E, dark: 0xE47777)

    private static func dynamic(light: UInt, dark: UInt) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

private extension UIColor {
    convenience init(hex: UInt) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

enum Space {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let s: CGFloat = 12
    static let m: CGFloat = 16
    static let l: CGFloat = 20
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
}

enum Radius {
    static let card: CGFloat = 16
    static let control: CGFloat = 12
    static let button: CGFloat = 999
}

/// Text styles, not fixed sizes: Dynamic Type is the accessibility gate (F5), so
/// every role scales. Metrics use rounded, tabular digits.
enum RupfitFont {
    static let screenTitle = Font.largeTitle.weight(.semibold)
    static let cardTitle = Font.title2.weight(.semibold)
    static let metric = Font.title.weight(.semibold).monospacedDigit()
    static let bigMetric = Font.largeTitle.weight(.semibold).monospacedDigit()
    static let label = Font.footnote.weight(.medium)
    static let body = Font.body
    static let meta = Font.subheadline
    static let caption = Font.caption
}
