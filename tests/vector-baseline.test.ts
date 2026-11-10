/**
 * The three drawings handed over for evaluation, measured.
 *
 * This is the probe that answers "can we just revectorise whatever arrives?": it reads the
 * files the owner dropped in `design/art/svg/` and prints the same report any external SVG
 * gets. They are kept out of `public/` on purpose — the ones that shipped live in
 * `public/art/`, and this test is the argument for why they should leave.
 *
 * Skips silently when the directory is empty, so deleting the experiment never breaks the
 * suite.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeReport, inspectSvg, vectorVerdict } from './vector-budget';

const DIR = fileURLToPath(new URL('../design/art/svg/', import.meta.url).href);

function tracedFiles(): readonly string[] {
  try {
    return readdirSync(DIR)
      .filter((file) => file.endsWith('.svg'))
      .sort();
  } catch {
    return [];
  }
}

describe('the traced artwork handed over for evaluation', () => {
  const files = tracedFiles();

  it('reports every file it found', () => {
    const lines = files.map((file) =>
      describeReport(file, inspectSvg(readFileSync(join(DIR, file), 'utf8'))),
    );
    if (lines.length > 0) console.log(`\n${lines.join('\n')}\n`);
    expect(lines.length).toBe(files.length);
  });

  it('finds that none of them fits the budget we draw with', () => {
    for (const file of files) {
      const verdict = vectorVerdict(inspectSvg(readFileSync(join(DIR, file), 'utf8')));
      expect(verdict.ok, `${file} unexpectedly fits`).toBe(false);
      // Every rejection must be explained, or the probe is just a stop sign.
      expect(verdict.reasons.length).toBeGreaterThan(0);
    }
  });
});
