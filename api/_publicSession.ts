import spreads from '../src/config/spreads.json' with { type: 'json' };
import { tarotDeckMap } from '../src/tarot/tarotDeck.js';

export interface PublicCard {
  cardId: string;
  selectionIndex: number;
  slotId: string;
  isReversed: boolean;
}

interface PublicSession {
  id: string;
  spread: { id: string };
  cards: PublicCard[];
}

export type Spread = (typeof spreads)[keyof typeof spreads];

export function validatePublicSession(payload: unknown, sessionId: string) {
  if (!payload || typeof payload !== 'object') return null;
  const session = payload as PublicSession;
  if (session.id !== sessionId || !session.spread || !Array.isArray(session.cards)) return null;
  const spread = Object.values(spreads).find((item) => item.id === session.spread.id);
  if (!spread || session.cards.length !== spread.cardCount) return null;
  if (!session.cards.every((card) => card && typeof card === 'object' &&
      Number.isInteger(card.selectionIndex) && typeof card.cardId === 'string' &&
      typeof card.slotId === 'string' && typeof card.isReversed === 'boolean')) return null;
  const seen = new Set<string>();
  const cards = [...session.cards].sort((a, b) => a.selectionIndex - b.selectionIndex);
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (!card || card.selectionIndex !== index || card.slotId !== spread.slots[index].id ||
        !tarotDeckMap.has(card.cardId) || seen.has(card.cardId)) return null;
    seen.add(card.cardId);
  }
  return { spread, cards };
}
