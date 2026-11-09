/**
 * One Supabase client for the whole app (ADR-0002).
 *
 * `@supabase/supabase-js` is imported only from `src/cloud`; nothing in `src/storage` or
 * `src/core` may see it, because the local store has to keep working with no network and
 * no account. The client is created lazily and only when configuration exists, so a build
 * without a Supabase project never constructs it and never touches the network.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cloudConfig, type CloudConfig } from './config';
import type { Database } from '../../supabase/types';

export type RupfitClient = SupabaseClient<Database>;

let cached: RupfitClient | null = null;

/** The configured client, or `null` when this build has no project. */
export function cloudClient(): RupfitClient | null {
  if (cached !== null) return cached;
  const config: CloudConfig | null = cloudConfig();
  if (config === null) return null;

  cached = createClient<Database>(config.url, config.anonKey, {
    auth: {
      // The app is installed to the Home Screen: a session has to survive the page being
      // discarded, and the refresh token has to be read back on the next launch.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'rupfit.auth',
    },
    global: { headers: { 'x-application-name': 'rupfit' } },
  });
  return cached;
}

/** Tests and sign-out use this to drop the cached client. */
export function resetCloudClient(): void {
  cached = null;
}
