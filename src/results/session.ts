import type { ResolvedDrawnCard, SpreadDefinition } from '../tarot/types';
import type { SpreadSession } from './types';

const REVEAL_QUOTE = '以虔诚之心领受过去，以洞明之眼赠予未来。';

export function createSpreadSession(options: {
  spread: SpreadDefinition;
  drawnCards: ResolvedDrawnCard[];
  revealedAt: string;
}) {
  const id = crypto.randomUUID();
  const createdAt = options.drawnCards[0]?.selectedAt ?? options.revealedAt;

  const session: SpreadSession = {
    version: 'auratarot.spread.v1',
    id,
    createdAt,
    revealedAt: options.revealedAt,
    status: 'revealed',
    spread: {
      id: options.spread.id,
      label: options.spread.label,
      cardCount: options.spread.cardCount
    },
    cards: options.drawnCards.map((draw) => ({
      cardId: draw.cardId,
      label: draw.card.label,
      slotId: draw.slotId,
      selectionIndex: draw.selectionIndex,
      slotPosition: {
        x: options.spread.slots[draw.selectionIndex]?.x ?? 0,
        y: options.spread.slots[draw.selectionIndex]?.y ?? 0,
        z: options.spread.slots[draw.selectionIndex]?.z ?? 0
      },
      isReversed: draw.isReversed,
      orientationLabel: draw.isReversed ? 'reversed' : 'upright'
    })),
    sharePath: `/spread/${id}`,
    quote: REVEAL_QUOTE,
    persistence: {
      provider: 'local',
      cloudBacked: false,
      syncedAt: null,
      lastSyncError: null
    }
  };

  return session;
}

export function markSessionCloudSynced(
  session: SpreadSession,
  syncedAt: string = new Date().toISOString()
) {
  return {
    ...session,
    persistence: {
      provider: 'supabase' as const,
      cloudBacked: true,
      syncedAt,
      lastSyncError: null
    }
  };
}

export function markSessionCloudError(
  session: SpreadSession,
  error: string
) {
  return {
    ...session,
    persistence: {
      ...session.persistence,
      provider: 'local' as const,
      cloudBacked: false,
      lastSyncError: error
    }
  };
}

export function buildShareUrl(sharePath: string) {
  return new URL(sharePath, window.location.origin).toString();
}

export function getSessionIdFromPath(pathname: string) {
  const match = pathname.match(/^\/spread\/([^/]+)$/i);
  return match?.[1] ?? null;
}
