#!/usr/bin/env node
/**
 * Rupfit icon pipeline — dependency-free.
 *
 * Source of truth: `public/icon.svg` (512×512 canvas, black field, lime glyph).
 * Outputs (committed files):
 *
 *   public/icon-192.png            192×192   manifest `any`
 *   public/icon-512.png            512×512   manifest `any`
 *   public/icon-512-maskable.png   512×512   manifest `maskable`, glyph centred in the safe area
 *   public/apple-touch-icon.png    180×180   iOS home screen
 *
 * Rasteriser: a locally installed Chromium (Microsoft Edge or Google Chrome) driven in
 * headless mode with `--screenshot`. No npm dependency is added, and the PNGs are
 * committed so a machine without a browser can still build.
 *
 * Usage:
 *   node tools/make-icons.mjs            # render the PNGs, then verify them
 *   node tools/make-icons.mjs --verify   # verify the committed PNGs only (no browser needed)
 *   ICON_BROWSER=/path/to/chrome node tools/make-icons.mjs
 *
 * Verification reads the real IHDR header and decodes the pixels, so a file that is
 * renamed, truncated, blank or wrongly sized fails instead of passing on its name.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(dirname(toolsDir), 'public');
const tmpDir = join(toolsDir, '.tmp');
const sourceSvg = join(publicDir, 'icon.svg');

/** Viewbox of public/icon.svg and the bounding box of its glyph path. */
const VIEWBOX = 512;
const GLYPH = { x0: 150, y0: 132, x1: 344, y1: 400 };

/** Black field and lime glyph, as used by public/icon.svg. */
const BACKGROUND = '#000000';

/**
 * maskable: the glyph is scaled about the canvas centre and translated so that its own
 * bounding box is centred. The maskable safe area is the circle whose diameter is 80% of
 * the canvas, so a 0.92 scale keeps the glyph's corners well inside it while matching the
 * visual weight of the `any` icons.
 */
const MASKABLE_GLYPH_SCALE = 0.92;

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------------------------------------------------------------------------
// Rendering (headless Chromium)
// ---------------------------------------------------------------------------

function findBrowser() {
  if (process.env.ICON_BROWSER) {
    if (!existsSync(process.env.ICON_BROWSER)) {
      throw new Error(`ICON_BROWSER points at a missing file: ${process.env.ICON_BROWSER}`);
    }
    return process.env.ICON_BROWSER;
  }

  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  for (const name of ['msedge', 'chrome', 'google-chrome', 'chromium']) {
    try {
      const found = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (found) return found;
    } catch {
      // not on PATH, keep looking
    }
  }
  return null;
}

/** Translation, in % of the canvas, that puts the glyph bbox centre on the canvas centre. */
function maskableTransform() {
  const glyphCenterX = (GLYPH.x0 + GLYPH.x1) / 2;
  const glyphCenterY = (GLYPH.y0 + GLYPH.y1) / 2;
  const half = VIEWBOX / 2;
  const x = ((half - glyphCenterX) / VIEWBOX) * 100 * MASKABLE_GLYPH_SCALE;
  const y = ((half - glyphCenterY) / VIEWBOX) * 100 * MASKABLE_GLYPH_SCALE;
  return `translate(${x.toFixed(4)}%, ${y.toFixed(4)}%) scale(${MASKABLE_GLYPH_SCALE})`;
}

function renderHtml(size, maskable) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>icon ${size}</title>
    <style>
      html, body { margin: 0; padding: 0; background: ${BACKGROUND}; overflow: hidden; }
      .frame { position: relative; width: ${size}px; height: ${size}px; background: ${BACKGROUND}; }
      .glyph {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        transform-origin: center center;
        ${maskable ? `transform: ${maskableTransform()};` : ''}
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <img class="glyph" src="${pathToFileURL(sourceSvg).href}" alt="" />
    </div>
  </body>
</html>
`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function screenshot(browser, htmlPath, pngPath, size) {
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=3000',
      `--user-data-dir=${join(tmpDir, 'profile')}`,
      `--window-size=${size},${size}`,
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: 'ignore', timeout: 120_000 },
  );

  // Chromium flushes the screenshot slightly after the process exits; wait for a stable file.
  const deadline = Date.now() + 15_000;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(pngPath)) {
      const { size: bytes } = statSync(pngPath);
      if (bytes > 0 && bytes === lastSize) return;
      lastSize = bytes;
    }
    sleep(150);
  }
  throw new Error(`browser produced no usable screenshot at ${pngPath}`);
}

// ---------------------------------------------------------------------------
// PNG decoding (header + pixels), no dependencies
// ---------------------------------------------------------------------------

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG (bad signature)');

  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
    if (type === 'IEND') break;
  }

  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR');
  if (!ihdr) throw new Error('missing IHDR');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];

  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || bpp === 0) {
    throw new Error(`unsupported PNG (bit depth ${bitDepth}, colour type ${colorType})`);
  }
  if (interlace !== 0) throw new Error('interlaced PNG is not supported');

  const idat = Buffer.concat(
    chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data),
  );
  const raw = inflateSync(idat);
  const stride = width * bpp + 1;
  if (raw.length !== stride * height) {
    throw new Error(`IDAT payload is ${raw.length} bytes, expected ${stride * height}`);
  }

  const pixels = Buffer.alloc(width * height * bpp);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * stride];
    for (let x = 0; x < width * bpp; x += 1) {
      const value = raw[y * stride + 1 + x];
      const left = x >= bpp ? pixels[y * width * bpp + x - bpp] : 0;
      const up = y > 0 ? pixels[(y - 1) * width * bpp + x] : 0;
      const upLeft = x >= bpp && y > 0 ? pixels[(y - 1) * width * bpp + x - bpp] : 0;
      let decoded;
      switch (filter) {
        case 0:
          decoded = value;
          break;
        case 1:
          decoded = value + left;
          break;
        case 2:
          decoded = value + up;
          break;
        case 3:
          decoded = value + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          decoded = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      pixels[y * width * bpp + x] = decoded & 0xff;
    }
  }

  return { width, height, bitDepth, colorType, bpp, pixels };
}

/** Glyph bounding box, glyph pixel count and corner opacity. */
function analyse(image) {
  const { width, height, bpp, pixels } = image;
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  let glyphPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * bpp;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      // lime #C6F24E against the black field
      if (g > 150 && b < 130 && r > 100) {
        glyphPixels += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ].map(([x, y]) => {
    const i = (y * width + x) * bpp;
    return {
      rgb: [pixels[i], pixels[i + 1], pixels[i + 2]],
      alpha: bpp === 4 ? pixels[i + 3] : 255,
    };
  });

  return { minX, maxX, minY, maxY, glyphPixels, corners };
}

function verify(target) {
  const file = join(publicDir, target.file);
  if (!existsSync(file)) return { problems: [`${target.file}: missing`] };

  let image;
  try {
    image = decodePng(readFileSync(file));
  } catch (error) {
    return { problems: [`${target.file}: ${error.message}`] };
  }

  const problems = [];
  if (image.width !== target.size || image.height !== target.size) {
    problems.push(
      `${target.file}: IHDR says ${image.width}×${image.height}, expected ${target.size}×${target.size}`,
    );
  }

  const stats = analyse(image);
  if (stats.glyphPixels === 0) problems.push(`${target.file}: no glyph pixels, the render is blank`);
  for (const corner of stats.corners) {
    if (corner.alpha !== 255) problems.push(`${target.file}: corner pixel is not opaque`);
    if (corner.rgb.some((channel) => channel > 16)) {
      problems.push(`${target.file}: corner pixel is ${corner.rgb.join(',')}, expected black`);
    }
  }

  const centre = (target.size - 1) / 2;
  const inset = target.size * 0.1; // inner 80% of the canvas
  const insideSafeBox =
    stats.minX >= inset &&
    stats.maxX <= target.size - 1 - inset &&
    stats.minY >= inset &&
    stats.maxY <= target.size - 1 - inset;
  const maxRadius = Math.max(
    ...[
      [stats.minX, stats.minY],
      [stats.maxX, stats.minY],
      [stats.minX, stats.maxY],
      [stats.maxX, stats.maxY],
    ].map(([x, y]) => Math.hypot(x - centre, y - centre)),
  );
  const safeRadius = target.size * 0.4; // maskable safe circle: 80% diameter

  if (target.maskable && stats.glyphPixels > 0) {
    const glyphCentreX = (stats.minX + stats.maxX) / 2;
    const glyphCentreY = (stats.minY + stats.maxY) / 2;
    if (Math.abs(glyphCentreX - centre) > 1.5 || Math.abs(glyphCentreY - centre) > 1.5) {
      problems.push(
        `${target.file}: glyph centre ${glyphCentreX.toFixed(1)},${glyphCentreY.toFixed(1)} is not the canvas centre ${centre},${centre}`,
      );
    }
    if (!insideSafeBox) problems.push(`${target.file}: glyph escapes the inner 80% box`);
    if (maxRadius > safeRadius) {
      problems.push(
        `${target.file}: glyph corner ${maxRadius.toFixed(1)}px exceeds the safe circle ${safeRadius.toFixed(1)}px`,
      );
    }
  }

  return {
    problems,
    detail: {
      file: target.file,
      size: `${image.width}×${image.height}`,
      colorType: image.colorType,
      bytes: readFileSync(file).length,
      glyph: `glyph x[${stats.minX},${stats.maxX}] y[${stats.minY},${stats.maxY}]`,
      safe: target.maskable ? `corner ${maxRadius.toFixed(1)}px / circle ${safeRadius.toFixed(1)}px` : '',
    },
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const verifyOnly = process.argv.includes('--verify');

if (!verifyOnly) {
  const browser = findBrowser();
  if (!browser) {
    console.error(
      'No Chromium found. Install Microsoft Edge or Google Chrome, or set ICON_BROWSER to its path.',
    );
    process.exit(1);
  }
  console.log(`rasteriser: ${browser}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    for (const target of TARGETS) {
      const htmlPath = join(tmpDir, `${target.file}.html`);
      const pngPath = join(publicDir, target.file);
      writeFileSync(htmlPath, renderHtml(target.size, target.maskable), 'utf8');
      screenshot(browser, htmlPath, pngPath, target.size);
      console.log(`rendered public/${target.file}`);
    }
  } finally {
    // Only ever removes tools/.tmp, which this script created.
    if (tmpDir === join(toolsDir, '.tmp')) rmSync(tmpDir, { recursive: true, force: true });
  }
}

let failed = false;
for (const target of TARGETS) {
  const { problems, detail } = verify(target);
  if (problems.length > 0) {
    failed = true;
    for (const problem of problems) console.error(`FAIL ${problem}`);
    continue;
  }
  console.log(
    `ok  ${detail.file.padEnd(25)} ${detail.size.padEnd(9)} ${String(detail.bytes).padStart(6)}B  ${detail.file.endsWith('.svg') ? '' : detail.glyph}${detail.safe ? `  ${detail.safe}` : ''}`,
  );
}

if (failed) process.exit(1);
console.log(verifyOnly ? 'all icons verified' : 'all icons rendered and verified');
