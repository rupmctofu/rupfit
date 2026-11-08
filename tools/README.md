# tools

Development-only helpers. They are not part of the app bundle and add no dependency:
everything here runs on the Node standard library that the build already needs.

## Icons

`public/icon.svg` is the source of truth for the app icon (512×512 canvas, black field,
lime glyph). Browsers and iOS cannot install from an SVG, so the PNG set is generated
from it and **committed**:

| File                            | Size    | Used by                                             |
| ------------------------------- | ------- | --------------------------------------------------- |
| `public/icon-192.png`           | 192×192 | web app manifest, `any`                             |
| `public/icon-512.png`           | 512×512 | web app manifest, `any`                             |
| `public/icon-512-maskable.png`  | 512×512 | web app manifest, `maskable`                        |
| `public/apple-touch-icon.png`   | 180×180 | `<link rel="apple-touch-icon">` for iOS home screen |

The maskable variant keeps the glyph inside the safe area: it is scaled to 92% about the
canvas centre and translated so that its own bounding box is centred, which leaves its
corners inside the maskable safe circle (80% diameter) with room to spare.

### Regenerate the PNGs

```bash
node tools/make-icons.mjs
```

The script drives a locally installed Chromium — Microsoft Edge or Google Chrome — in
headless mode with `--screenshot`, rendering a minimal HTML page that contains only the
icon on a black field, sized exactly to the target. It finds the browser in the usual
Windows, macOS and Linux locations; override with `ICON_BROWSER`:

```bash
ICON_BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tools/make-icons.mjs
```

Scratch files live in `tools/.tmp/` and are removed by the script itself.

### Verify the committed PNGs

```bash
node tools/make-icons.mjs --verify
```

Verification needs no browser. It reads the real IHDR header (so a renamed, truncated or
wrongly sized file fails) and decodes the pixels to check that the glyph is actually
drawn, that the field is opaque black, and that the maskable glyph is centred and inside
the safe area. Both commands exit non-zero on any problem.

If neither Edge nor Chrome is available, the icons do not need to be regenerated: the
committed PNGs are what the build consumes.
