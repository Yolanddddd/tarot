export const SPREAD_IDS = ['futureCross', 'hexagram', 'monthlyFlow'] as const;
export const READING_CATEGORIES = ['application', 'study', 'career', 'phd', 'relationships', 'general'] as const;

export type RecommendedSpread = {
  spreadId: (typeof SPREAD_IDS)[number];
  category: (typeof READING_CATEGORIES)[number];
  reason: string;
};

export function parseSpreadRecommendation(value: unknown): RecommendedSpread | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (!SPREAD_IDS.includes(result.spreadId as RecommendedSpread['spreadId']) ||
      !READING_CATEGORIES.includes(result.category as RecommendedSpread['category']) ||
      typeof result.reason !== 'string') return null;
  const reason = result.reason.trim();
  if (reason.length < 8 || reason.length > 180) return null;
  return { spreadId: result.spreadId as RecommendedSpread['spreadId'],
    category: result.category as RecommendedSpread['category'], reason };
}
