export type InputSource = 'hand' | 'mouse' | 'touch';

export interface InteractionIntent {
  id: number;
  cardId: string | null;
  source: InputSource;
  timestamp: number;
}
