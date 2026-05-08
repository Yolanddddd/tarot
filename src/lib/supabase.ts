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
let clientPromise: Promise<SupabaseLikeClient | null> | null = null;
let clientLoadError: string | null = null;

export function isSupabaseConfigured() {
  return Boolean(
    getNormalizedSupabaseUrl() && getNormalizedSupabasePublishableKey()
  );
}

export function getSupabaseClientLoadError() {
  return clientLoadError;
}

export async function getSupabaseClient() {
  const supabaseUrl = getNormalizedSupabaseUrl();
  const supabasePublishableKey = getNormalizedSupabasePublishableKey();

  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  if (client !== undefined) {
    return client;
  }

  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then((supabaseModule) => {
        const typedModule = supabaseModule as unknown as {
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
        };

        clientLoadError = null;
        client = typedModule.createClient(
          supabaseUrl,
          supabasePublishableKey,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false
            }
          }
        ) as SupabaseLikeClient;

        return client;
      })
      .catch((error) => {
        clientLoadError =
          error instanceof Error
            ? error.message
            : 'Supabase 客户端加载失败。';
        client = null;
        return null;
      });
  }

  if (client === undefined) {
    client = await clientPromise;
  }

  if (client === undefined) {
    client = null;
  }

  return client;
}

function getNormalizedSupabaseUrl() {
  const raw = normalizeEnvValue(runtimeConfig.supabase.url);

  if (!raw) {
    return '';
  }

  const withoutRestPath = raw.replace(/\/rest\/v1\/?$/i, '');
  const withoutTrailingSlash = withoutRestPath.replace(/\/+$/g, '');

  try {
    const parsed = new URL(withoutTrailingSlash);

    if (!/^https?:$/i.test(parsed.protocol)) {
      return '';
    }

    return parsed.origin;
  } catch {
    return '';
  }
}

function getNormalizedSupabasePublishableKey() {
  return normalizeEnvValue(runtimeConfig.supabase.publishableKey);
}

function normalizeEnvValue(value: string) {
  return value.trim().replace(/^['"]+|['"]+$/g, '');
}
