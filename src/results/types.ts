export interface SpreadResultCard {
  cardId: string;
  label: string;
  slotId: string;
  selectionIndex: number;
  slotPosition: {
    x: number;
    y: number;
    z: number;
  };
  isReversed: boolean;
  orientationLabel: 'upright' | 'reversed';
}

export interface SpreadSessionPersistence {
  provider: 'local' | 'supabase';
  cloudBacked: boolean;
  syncedAt: string | null;
  lastSyncError: string | null;
}

export interface SpreadSession {
  version: 'auratarot.spread.v1';
  id: string;
  createdAt: string;
  revealedAt: string;
  status: 'revealed';
  spread: {
    id: string;
    label: string;
    cardCount: number;
  };
  cards: SpreadResultCard[];
  sharePath: string;
  quote: string;
  persistence: SpreadSessionPersistence;
}
