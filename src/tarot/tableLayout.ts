import type { SpreadSlot } from './types';

export interface CardPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fit the original coordinates with one scale, preserving every spread's shape. */
export function fitSpread(
  slots: Array<Pick<SpreadSlot, 'x' | 'y'>>,
  width: number,
  height: number,
  padding = 12
) {
  const xs = slots.map((slot) => slot.x);
  const ys = slots.map((slot) => slot.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const scale = Math.max(1, Math.min(
    (width - padding * 2) / (maxX - minX + 1.3),
    (height - padding * 2) / (maxY - minY + 1.8),
    100
  ));

  return slots.map((slot): CardPlacement => ({
    x: width / 2 + (slot.x - (minX + maxX) / 2) * scale,
    y: height / 2 - (slot.y - (minY + maxY) / 2) * scale,
    width: scale * 0.82,
    height: scale * 1.42
  }));
}

/** All 78 remain in view; only the small neighborhood under a finger expands. */
export function spreadDeckCenters(
  width: number,
  cardWidth: number,
  count: number,
  focus: number | null
) {
  const padding = Math.max(10, Math.min(40, width * 0.035));
  const leftEdge = padding + cardWidth / 2;
  const rightEdge = width - padding - cardWidth / 2;
  const span = Math.max(0, rightEdge - leftEdge);
  if (count <= 1) return [width / 2];
  if (focus === null) {
    return Array.from({ length: count }, (_, i) => leftEdge + span * i / (count - 1));
  }

  const active = Math.max(0, Math.min(count - 1, focus));
  const start = Math.max(0, active - 2);
  const end = Math.min(count - 1, active + 2);
  const spacing = Math.min(cardWidth * 0.85, span / 8);
  const minStep = Math.min(2, span / (count - 1) * 0.45);
  const center = Math.max(
    leftEdge + (active - start) * spacing + start * minStep,
    Math.min(
      rightEdge - (end - active) * spacing - (count - 1 - end) * minStep,
      leftEdge + span * active / (count - 1)
    )
  );
  const localLeft = center - (active - start) * spacing;
  const localRight = center + (end - active) * spacing;

  return Array.from({ length: count }, (_, i) => {
    if (i < start) return leftEdge + (localLeft - leftEdge) * i / start;
    if (i > end) return localRight + (rightEdge - localRight) * (i - end) / (count - 1 - end);
    return localLeft + (i - start) * spacing;
  });
}

export function getTableLayout(
  width: number,
  height: number,
  slots: SpreadSlot[],
  count: number,
  focus: number | null
) {
  const compact = height < 390;
  const cardHeight = compact
    ? Math.max(44, Math.min(84, height * 0.32))
    : Math.max(84, Math.min(150, height * 0.24));
  const cardWidth = cardHeight * 0.82 / 1.42;
  const deckY = height - cardHeight / 2 - 10;
  const spreadHeight = Math.max(36, height - cardHeight - (compact ? 36 : 58));
  const spread = fitSpread(slots, width, spreadHeight, compact ? 4 : 12);
  const centers = spreadDeckCenters(width, cardWidth, count, focus);
  const deck = centers.map((x, i): CardPlacement => ({
    x,
    y: deckY - (focus === null ? 0 : i === focus ? 24 : Math.abs(i - focus) === 1 ? 8 : 0),
    width: cardWidth,
    height: cardHeight
  }));
  return { deck, spread, deckY, spreadHeight, compact, dots: spread[0]?.width < 23 };
}
