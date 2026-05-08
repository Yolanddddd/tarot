import type { TarotCard } from './types';

const majorArcana = [
  'The Fool',
  'The Magician',
  'The High Priestess',
  'The Empress',
  'The Emperor',
  'The Hierophant',
  'The Lovers',
  'The Chariot',
  'Strength',
  'The Hermit',
  'Wheel of Fortune',
  'Justice',
  'The Hanged Man',
  'Death',
  'Temperance',
  'The Devil',
  'The Tower',
  'The Star',
  'The Moon',
  'The Sun',
  'Judgement',
  'The World'
] as const;

const minorRanks = [
  'Ace',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Page',
  'Knight',
  'Queen',
  'King'
] as const;

const suits = [
  { key: 'wands', label: 'Wands' },
  { key: 'cups', label: 'Cups' },
  { key: 'swords', label: 'Swords' },
  { key: 'pentacles', label: 'Pentacles' }
] as const;

const majorCards = majorArcana.map((label, index) => ({
  id: `major-${String(index).padStart(2, '0')}-${slugify(label)}`,
  label,
  arcana: 'major' as const,
  suit: 'major' as const,
  order: index
}));

const minorCards = suits.flatMap((suit, suitIndex) =>
  minorRanks.map((rank, rankIndex) => ({
    id: `${suit.key}-${slugify(rank)}`,
    label: `${rank} of ${suit.label}`,
    arcana: 'minor' as const,
    suit: suit.key,
    order: majorCards.length + suitIndex * minorRanks.length + rankIndex
  }))
);

export const tarotDeck: TarotCard[] = [...majorCards, ...minorCards];
export const tarotDeckMap = new Map(tarotDeck.map((card) => [card.id, card]));

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
