interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

// Temporary deployment diagnostic. Do not expose environment values or user data.
export default async function handler(_req: unknown, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const checks = {
    supabase: await checkImport(() => import('@supabase/supabase-js')),
    spreadRecommendation: await checkImport(() => import('./_spreadRecommendation.js')),
    publicSession: await checkImport(() => import('./_publicSession.js')),
    privateReading: await checkImport(() => import('./_privateReading.js')),
    cacheKey: await checkImport(() => import('./_cacheKey.js'))
  };
  return res.status(200).json({ functionStarted: true, moduleChecks: checks });
}

async function checkImport(load: () => Promise<unknown>): Promise<string> {
  try {
    await load();
    return 'ok';
  } catch (error) {
    if (error && typeof error === 'object') {
      const typed = error as { code?: unknown; name?: unknown };
      if (typeof typed.code === 'string') return typed.code;
      if (typeof typed.name === 'string') return typed.name;
    }
    return 'error';
  }
}
