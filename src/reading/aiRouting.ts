import type { RoutingDecision } from './routing';

const spreadIds = ['futureCross', 'hexagram', 'monthlyFlow'];
const categories = ['application', 'study', 'career', 'phd', 'relationships', 'general'];

export async function recommendSpreadWithAi(question: string, accessToken: string): Promise<RoutingDecision | null> {
  try {
    const response = await fetch('/api/recommend-spread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) return null;
    const result = await response.json() as Record<string, unknown>;
    if (!spreadIds.includes(String(result.spreadId)) || !categories.includes(String(result.category)) ||
        typeof result.reason !== 'string' || result.reason.trim().length < 8 ||
        result.reason.length > 180) return null;
    return result as unknown as RoutingDecision;
  } catch {
    return null;
  }
}
