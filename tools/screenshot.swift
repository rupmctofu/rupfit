// Renders a local HTML file to PNG with the system WebKit, at the exact size of
// an iPhone screen. Used for the F2 artboards and, later, for F5 snapshot
// baselines. No third-party dependency, no simulator.
//
//   swift tools/screenshot.swift <url> <out.png> <width> <height>
//
// Example:
//   swift tools/screenshot.swift \
//     "file:///.../design/f2-mvp/index.html?only=sesion-decision" \
//     design/f2-mvp/renders/sesion-decision.png 393 852
//
// The snapshot is taken at 2× the logical size, which is what the simulator
// would produce for an iPhone 15.

import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count == 5,
      let url = URL(string: args[1]),
      let width = Double(args[3]),
      let height = Double(args[4]) else {
    FileHandle.standardError.write(Data("usage: screenshot.swift <url> <out.png> <w> <h>\n".utf8))
    exit(64)
}
let outputPath = args[2]

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height))
let window = NSWindow(
    contentRect: NSRect(x: -20_000, y: -20_000, width: width, height: height),
    styleMask: [.borderless],
    backing: .buffered,
    defer: false
)
window.contentView = webView
window.orderFrontRegardless()

final class Renderer: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Let fonts settle and layout flush before the snapshot.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            let configuration = WKSnapshotConfiguration()
            configuration.rect = CGRect(origin: .zero, size: webView.bounds.size)
            configuration.snapshotWidth = NSNumber(value: webView.bounds.width)
            webView.takeSnapshot(with: configuration) { image, error in
                guard let image,
                      let tiff = image.tiffRepresentation,
                      let bitmap = NSBitmapImageRep(data: tiff),
                      let png = bitmap.representation(using: .png, properties: [:]) else {
                    print("snapshot failed: \(String(describing: error))")
                    exit(1)
                }
                do {
                    try png.write(to: URL(fileURLWithPath: outputPath))
                } catch {
                    print("write failed: \(error)")
                    exit(1)
                }
                print("\(outputPath) \(bitmap.pixelsWide)×\(bitmap.pixelsHigh)")
                exit(0)
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("navigation failed: \(error)")
        exit(1)
    }
}

let renderer = Renderer()
webView.navigationDelegate = renderer
webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())

DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
    print("timed out")
    exit(2)
}
app.run()
