import { runtimeConfig } from '../config/runtime';
import type { Point3D } from '../gesture/types';
import { tarotDeck } from './tarotDeck';
import type { DeckCardLayout, DrawnCardState, SpreadDefinition } from './types';

interface BuildDeckLayoutOptions {
  spread: SpreadDefinition;
  drawnCards: DrawnCardState[];
  pointerWorld: Point3D | null;
  hoveredCardId?: string | null;
  deckOrder: string[];
  fanOpen: boolean;
}

const FLAT_SPREAD_WIDTH = runtimeConfig.sceneBounds.x * 2 * 0.94;
const FLAT_SPREAD_Y = -1.95;
const FLAT_SPREAD_Z_STEP = 0.018;
const HOVER_THRESHOLD = 1.15;
const SPREAD_HOVER_THRESHOLD = 1.45;
const CARD_HIT_HALF_WIDTH = 0.52;
const CARD_HIT_HALF_HEIGHT = 0.82;

export function buildDeckLayouts({
  spread,
  drawnCards,
  pointerWorld,
  hoveredCardId,
  deckOrder,
  fanOpen
}: BuildDeckLayoutOptions) {
  const selectedById = new Map(drawnCards.map((draw) => [draw.cardId, draw]));
  const orderIndexById = new Map(deckOrder.map((cardId, index) => [cardId, index]));
  const resolvedHoveredCardId = resolveHoveredCardId({
    spread,
    drawnCards,
    pointerWorld,
    hoveredCardId,
    deckOrder,
    fanOpen
  });

  return tarotDeck.map((card): DeckCardLayout => {
    const drawnCard = selectedById.get(card.id);
    const orderIndex = orderIndexById.get(card.id) ?? card.order;

    if (drawnCard) {
      const slot = spread.slots[drawnCard.selectionIndex] ?? {
        x: 0,
        y: 0,
        z: 0
      };
      const isHovered = resolvedHoveredCardId === card.id && !drawnCard.isRevealed;
      const revealBoost = drawnCard.isRevealed ? 0.25 : 0;
      const hoverBoost = isHovered ? 0.18 : 0;

      return {
        id: card.id,
        label: card.label,
        orderIndex: drawnCard.selectionIndex,
        position: {
          x: slot.x,
          y: slot.y + hoverBoost,
          z: 1.15 + revealBoost + drawnCard.selectionIndex * 0.05 + (isHovered ? 0.18 : 0)
        },
        rotation: {
          x: 0,
          y: drawnCard.isRevealed ? Math.PI : 0,
          z: drawnCard.isRevealed && drawnCard.isReversed ? Math.PI : 0
        },
        scale: drawnCard.isRevealed ? 1.12 : isHovered ? 1.08 : 1.04,
        isHovered,
        isSelected: true,
        isRevealed: drawnCard.isRevealed,
        isReversed: drawnCard.isReversed,
        selectionIndex: drawnCard.selectionIndex
      };
    }

    const basePlacement = fanOpen
      ? getFlatPlacement(orderIndex, deckOrder.length)
      : {
          position: getStackPosition(orderIndex),
          rotation: getStackRotation(orderIndex)
        };
    const isHovered = fanOpen && card.id === resolvedHoveredCardId;

    return {
      id: card.id,
      label: card.label,
      orderIndex,
      position: {
        x: basePlacement.position.x,
        y: basePlacement.position.y + (isHovered ? 0.2 : 0),
        z: basePlacement.position.z + (isHovered ? 0.3 : 0)
      },
      rotation: basePlacement.rotation,
      scale: isHovered ? 1.08 : 1,
      isHovered,
      isSelected: false,
      isRevealed: false,
      isReversed: false,
      selectionIndex: null
    };
  });
}

export function resolveHoveredCardId(options: BuildDeckLayoutOptions) {
  const {
    spread,
    drawnCards,
    pointerWorld,
    hoveredCardId,
    deckOrder,
    fanOpen
  } = options;

  if (hoveredCardId) {
    return hoveredCardId;
  }

  if (!pointerWorld || !fanOpen) {
    return null;
  }

  const selectedById = new Map(drawnCards.map((draw) => [draw.cardId, draw]));
  const canRevealFromSpread =
    drawnCards.length >= spread.cardCount &&
    drawnCards.some((draw) => !draw.isRevealed);

  if (canRevealFromSpread) {
    let hoveredSelectedId: string | null = null;
    let nearestSelectedDistance = Number.POSITIVE_INFINITY;

    for (const draw of drawnCards) {
      if (draw.isRevealed) {
        continue;
      }

      const slot = spread.slots[draw.selectionIndex];
      if (!slot) {
        continue;
      }

      const distance = distance2D(pointerWorld, slot);

      if (distance < nearestSelectedDistance) {
        nearestSelectedDistance = distance;
        hoveredSelectedId = draw.cardId;
      }
    }

    if (nearestSelectedDistance <= SPREAD_HOVER_THRESHOLD) {
      return hoveredSelectedId;
    }
  }

  let hoveredDeckId: string | null = null;
  let nearestDeckDistance = Number.POSITIVE_INFINITY;
  let topmostDeckId: string | null = null;
  let topmostDeckZ = Number.NEGATIVE_INFINITY;
  let topmostDeckDistance = Number.POSITIVE_INFINITY;

  for (const [index, cardId] of deckOrder.entries()) {
    if (selectedById.has(cardId)) {
      continue;
    }

    const flatPlacement = getFlatPlacement(index, deckOrder.length);
    const containsPointer =
      Math.abs(pointerWorld.x - flatPlacement.position.x) <= CARD_HIT_HALF_WIDTH &&
      Math.abs(pointerWorld.y - flatPlacement.position.y) <= CARD_HIT_HALF_HEIGHT;
    const distance = distance2D(pointerWorld, flatPlacement.position);

    if (
      containsPointer &&
      (flatPlacement.position.z > topmostDeckZ ||
        (flatPlacement.position.z === topmostDeckZ &&
          distance < topmostDeckDistance))
    ) {
      topmostDeckId = cardId;
      topmostDeckZ = flatPlacement.position.z;
      topmostDeckDistance = distance;
    }

    if (distance < nearestDeckDistance) {
      nearestDeckDistance = distance;
      hoveredDeckId = cardId;
    }
  }

  if (topmostDeckId) {
    return topmostDeckId;
  }

  if (nearestDeckDistance > HOVER_THRESHOLD) {
    return null;
  }

  return hoveredDeckId;
}

function getFlatPlacement(index: number, total: number) {
  const safeTotal = Math.max(total, 1);
  const spacing = safeTotal === 1 ? 0 : FLAT_SPREAD_WIDTH / (safeTotal - 1);
  const startX = -FLAT_SPREAD_WIDTH / 2;
  const x = startX + index * spacing;
  const depthOffset = -index * FLAT_SPREAD_Z_STEP;
  const verticalDrift = Math.sin((index / safeTotal) * Math.PI * 1.5) * 0.08;

  return {
    position: {
      x,
      y: FLAT_SPREAD_Y + verticalDrift,
      z: depthOffset
    },
    rotation: {
      x: 0.04,
      y: 0,
      z: 0
    }
  };
}

function getStackPosition(index: number) {
  return {
    x: 0,
    y: -0.2,
    z: -index * 0.014
  };
}

function getStackRotation(index: number) {
  return {
    x: 0.08,
    y: 0,
    z: (index % 6 - 3) * 0.01
  };
}

function distance2D(a: Point3D, b: Point3D) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
