/**
 * The accent budget (docs/design-system.md §4, odd/tasks/ui-design-review.md S2): the
 * lime is for the screen's one primary action, an active state, and the single data point
 * that matters. Nothing enforces that with an element to test — the project has no DOM
 * tests — so this probe pins the *stylesheet* budget instead: it reads every feature and
 * app CSS file from disk and fails when a declaration uses the accent or its text
 * variant outside the allow-list below.
 *
 * It reads from disk through the declared Node subset in `./node-runtime.d.ts`, not
 * through Vite's `?raw`: in this toolchain a `?raw` import of a `.css` file arrives
 * empty (the CSS pipeline consumes it before the raw loader), and an always-empty
 * source would make every rule below pass vacuously — the probe would be a green lie.
 *
 * The allow-list is the point. It is maintained by hand, not generated: each entry is
 * an exact trimmed declaration line, with a comment naming the rule it serves. A future
 * screen that paints an ordinary element lime fails this test with the file and the
 * line, and has to argue its way in here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url).href);

/** Accent flavours a stylesheet may spell. `--color-accent` also covers `-text`/`-muted`. */
const ACCENT = /var\(--color-accent|#b8f34a|#c6f24e/i;

/** Dev surfaces: the gallery ships every tone on purpose, and demos live beside the tab bar. */
const SKIP = new Set(['/gallery.css', '/demo.css']);

type AllowList = Readonly<Record<string, readonly string[]>>;

/**
 * Every entry is one exact trimmed line and one named rule. Nothing joins this list
 * without a comment answering: which of the three accent roles (primary action, active
 * state, the data point that matters) does this serve?
 */
const ALLOWED: AllowList = {
  'app/shell.css': [
    // Active state: the current tab of the tab bar (§4).
    'color: var(--color-accent, #c6f24e);',
  ],
  'features/home/home.css': [
    // The today marker: the single data point Inicio exists to answer ("do I train today?").
    'border-color: var(--color-accent);',
    'color: var(--color-accent);',
    // The today cell's tinted surface: the same data point, readable at a glance.
    'background: var(--color-accent-muted);',
    'color: var(--color-accent-text);',
  ],
  'features/profile/profile.css': [
    // Active state of the real switch: on = lime track, the switch affordance itself (§4).
    'background: var(--color-accent);',
    'background: var(--color-accent-ink);',
  ],
  'features/session/session.css': [
    // Data point: the live session's bar in the six-session strip, the one that matters.
    'background: var(--color-accent);',
    // The demo port's selected chip follows the tinted selected-control rule (§4); the
    // demo strip is a review surface, and its pill stays consistent with `Chip`.
    'background: var(--color-accent-muted);',
    'color: var(--color-accent-text);',
  ],
};

function cssFiles(dir: string, prefix: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full, `${prefix}${entry}/`));
    else if (entry.endsWith('.css')) out.push(`${prefix}${entry}`);
  }
  return out;
}

const files = [...cssFiles(join(SRC, 'app'), 'app/'), ...cssFiles(join(SRC, 'features'), 'features/')]
  .filter((file) => !SKIP.has(file.slice(file.lastIndexOf('/'))))
  .sort();

describe('accent budget (docs/design-system.md §4)', () => {
  it('reads the stylesheets the shell actually ships', () => {
    // The probe walks `app/` and `features/` only: `design-system/` owns the token
    // definition, it does not spend it per screen. Eight stylesheets shipped today.
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(files).toContain('app/shell.css');
    expect(files).toContain('features/session/session.css');
  });

  it('reads real stylesheet bytes, not empty stubs', () => {
    const source = readFileSync(join(SRC, 'app/shell.css'), 'utf8');
    expect(source.length).toBeGreaterThan(500);
  });

  it('declares the allow-list only for stylesheets that exist', () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(files).toContain(file);
    }
  });

  for (const file of files) {
    it(`${file} spends the accent only inside its allow-list`, () => {
      const source = readFileSync(join(SRC, file), 'utf8');
      const offenders: string[] = [];
      source.split('\n').forEach((line, index) => {
        const trimmed = line.trim();
        if (!ACCENT.test(line)) return;
        if (!(ALLOWED[file] ?? []).includes(trimmed)) {
          offenders.push(`${file}:${index + 1}: ${trimmed}`);
        }
      });
      expect(offenders).toEqual([]);
    });
  }
});
