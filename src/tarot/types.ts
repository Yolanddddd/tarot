import type { Point3D } from '../gesture/types';

export interface SpreadSlot extends Point3D {
  id: string;
}

export interface SpreadDefinition {
  id: string;
  label: string;
  cardCount: number;
  slots: SpreadSlot[];
}

export interface Rotation3D extends Point3D {}

export interface TarotCard {
  id: string;
  label: string;
  arcana: 'major' | 'minor';
  suit: 'wands' | 'cups' | 'swords' | 'pentacles' | 'major';
  order: number;
}

export interface DrawnCardState {
  cardId: string;
  selectionIndex: number;
  isRevealed: boolean;
  isReversed: boolean;
  selectedAt: string;
  revealedAt: string | null;
}

export interface ResolvedDrawnCard extends DrawnCardState {
  card: TarotCard;
  slotId: string;
}

export interface DeckCardLayout {
  id: string;
  label: string;
  orderIndex: number;
  position: Point3D;
  rotation: Rotation3D;
  scale: number;
  isHovered: boolean;
  isSelected: boolean;
  isRevealed: boolean;
  isReversed: boolean;
  selectionIndex: number | null;
}
