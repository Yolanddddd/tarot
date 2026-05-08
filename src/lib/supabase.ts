import { runtimeConfig } from '../config/runtime';

interface SupabaseLikeClient {
  from: (table: string) => {
    insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        limit: (
          count: number
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
}

let client: SupabaseLikeClient | null | undefined;
let importAttempted = false;

export function isSupabaseConfigured() {
  return Boolean(
    runtimeConfig.supabase.url && runtimeConfig.supabase.publishableKey
  );
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (client === undefined) {
    if (importAttempted) {
      return null;
    }

    importAttempted = true;

    try {
      const loadModule = new Function(
        'specifier',
        'return import(specifier)'
      ) as (specifier: string) => Promise<{
        createClient: (
          url: string,
          key: string,
          options: {
            auth: {
              persistSession: boolean;
              autoRefreshToken: boolean;
              detectSessionInUrl: boolean;
            };
          }
        ) => SupabaseLikeClient;
      }>;
      const supabaseModule = await loadModule('@supabase/supabase-js');

      client = supabaseModule.createClient(
        runtimeConfig.supabase.url,
        runtimeConfig.supabase.publishableKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      ) as SupabaseLikeClient;
    } catch {
      client = null;
    }
  }

  return client;
}
