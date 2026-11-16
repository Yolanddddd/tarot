import { createHash } from 'node:crypto';

export interface CacheKeyInput {
  promptVersion: string;
  provider: string;
  model: string;
  spreadId: string;
  meaningVersion: string;
  cards: Array<{ cardId: string; isReversed: boolean }>;
}

export function buildInterpretationCacheKey(input: CacheKeyInput) {
  return createHash('sha256').update(JSON.stringify({
    promptVersion: input.promptVersion,
    provider: input.provider,
    model: input.model,
    spreadId: input.spreadId,
    meaningVersion: input.meaningVersion,
    cards: input.cards.map(({ cardId, isReversed }) => [cardId, isReversed])
  })).digest('hex');
}
