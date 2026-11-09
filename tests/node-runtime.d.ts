/**
 * Minimal ambient declarations for the probe that reads fixture CSS at test time
 * (`tests/accent-budget.test.ts`, and any future filesystem probe).
 *
 * The typecheck pipeline deliberately ships no `@types/node` (`"types": []`): the product
 * is a browser PWA whose sources must never type-reference Node, and the user constraint
 * forbids adding dependencies without a clear justification. This file is the narrow
 * excuse: it exposes exactly the four Node builtins the probes use, and nothing else —
 * no product file can quietly start importing `node:*`, because `src/` is typechecked
 * by `tsconfig.app.json`, which does not include this directory.
 *
 * Pure ambient: no top-level import/export, so the declarations stay global.
 */
declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...segments: string[]): string;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

/** The module context the probes resolve paths from (ESM, as vitest runs it). */
interface ImportMeta {
  readonly url: string;
}

var URL: {
  // `href` instead of a nominal string, since the only consumer feeds it to fileURLToPath.
  new (url: string, base?: string): { href: string };
};
