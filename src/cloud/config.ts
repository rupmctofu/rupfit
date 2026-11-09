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

interface ViteEnv {
  readonly VITE_SUPABASE_URL?: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY?: string | undefined;
}

/**
 * Vite inlines `import.meta.env` at build time. The cast keeps this module usable from
 * Node tests, where the object does not exist.
 */
function env(): ViteEnv {
  const meta = import.meta as unknown as { readonly env?: ViteEnv };
  return meta.env ?? {};
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
  const source = env();
  const url = usable(source.VITE_SUPABASE_URL);
  const anonKey = usable(source.VITE_SUPABASE_ANON_KEY);
  if (url === null || anonKey === null) return null;
  return { url, anonKey };
}

/** The sentence the account screen shows when the build has no project configured. */
export const CLOUD_NOT_CONFIGURED =
  'Esta copia de Rupfit no tiene proyecto en la nube configurado. Tus datos siguen en este dispositivo.';
