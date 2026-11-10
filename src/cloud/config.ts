/**
 * The cloud account's configuration (ADR-0002).
 *
 * Two values, both public by design: the project URL and the publishable (anon) key.
 * Every table is behind Row Level Security, so the browser holding that key can only ever
 * read and write its own rows. The `service_role` key never appears in the client — it
 * bypasses RLS and would hand every account to anyone who opens the bundle.
 *
 * Absent configuration is a normal state, not an error: Rupfit is local-first, and an app
 * with no account has to keep working exactly as it did before this feature existed. So
 * `cloudConfig()` returns `null` instead of throwing, and everything above it treats
 * "no cloud" as one more honest state.
 */

export interface CloudConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Vite replaces `import.meta.env.VITE_SUPABASE_URL` textually at build time — and that is
 * why the property is read here as a literal expression instead of through a variable
 * holding `import.meta.env`: a dynamic property access is not replaced, so the bundle kept
 * shipping an empty URL even with the variables exported by CI.
 *
 * The guard keeps the module usable from Node tests, where `import.meta.env` is absent.
 */
function raw(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  try {
    if (key === 'VITE_SUPABASE_URL') return import.meta.env.VITE_SUPABASE_URL;
    return import.meta.env.VITE_SUPABASE_ANON_KEY;
  } catch {
    return undefined;
  }
}

/** Trims and rejects obvious placeholders, so a copied template fails loudly at sign-in. */
function usable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return null;
  if (trimmed.startsWith('https://your-project')) return null;
  if (trimmed === 'your-publishable-anon-key') return null;
  return trimmed;
}

export function cloudConfig(): CloudConfig | null {
  const url = usable(raw('VITE_SUPABASE_URL'));
  const anonKey = usable(raw('VITE_SUPABASE_ANON_KEY'));
  if (url === null || anonKey === null) return null;
  return { url, anonKey };
}

/** The sentence the account screen shows when the build has no project configured. */
export const CLOUD_NOT_CONFIGURED =
  'Esta copia de Rupfit no tiene proyecto en la nube configurado. Tus datos siguen en este dispositivo.';
