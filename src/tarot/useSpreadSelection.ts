import { useCallback, useEffect, useRef, useState } from 'react';
import { spreadList, spreadMap, type SpreadId } from '../config/spreads';
import type { HandTrackingFrame } from '../gesture/types';
import type { InteractionIntent } from '../interaction/types';
import { createSpreadSession } from '../results/session';
import { persistSpreadSession } from '../results/repository';
import type { SpreadSession } from '../results/types';
import { buildDeckLayouts, resolveHoveredCardId } from './layout';
import { tarotDeck, tarotDeckMap } from './tarotDeck';
import type { DrawnCardState, ResolvedDrawnCard } from './types';

interface PersistenceState {
  status: 'idle' | 'saving' | 'cloud' | 'local';
  message: string;
}

interface UseSpreadSelectionOptions {
  frame: HandTrackingFrame;
  hoveredCardId: string | null;
  selectIntent: InteractionIntent | null;
  revealIntent: InteractionIntent | null;
  onViewResults: (sharePath: string) => void;
}

const HOVER_SELECT_DWELL_MS = 2000;
const HOVER_SELECT_SUSTAIN_RADIUS = 1.45;

export function useSpreadSelection({
  frame,
  hoveredCardId,
  selectIntent,
  revealIntent,
  onViewResults
}: UseSpreadSelectionOptions) {
  const [activeSpreadId, setActiveSpreadId] = useState<SpreadId>('futureCross');
  const [drawnCardsState, setDrawnCardsState] = useState<DrawnCardState[]>([]);
  const [fanOpen, setFanOpen] = useState(false);
  const [deckOrder, setDeckOrder] = useState<string[]>(() =>
    tarotDeck.map((card) => card.id)
  );
  const [revealedSession, setRevealedSession] = useState<SpreadSession | null>(
    null
  );
  const [persistenceState, setPersistenceState] = useState<PersistenceState>({
    status: 'idle',
    message: '尚未生成结果页。'
  });
  const [shuffleMotionKey, setShuffleMotionKey] = useState(0);
  const hoverSelectionState = useRef<{
    cardId: string | null;
    startedAt: number;
  }>({
    cardId: null,
    startedAt: 0
  });
  const lastSelectionAt = useRef(0);
  const lastShuffleAt = useRef(0);
  const revealInFlight = useRef(false);

  const spread = spreadMap[activeSpreadId];
  const pointerWorld = frame.pointer?.world ?? null;
  const selectionLocked = drawnCardsState.length >= spread.cardCount;
  const deckLayouts = buildDeckLayouts({
    spread,
    drawnCards: drawnCardsState,
    pointerWorld,
    hoveredCardId,
    deckOrder,
    fanOpen
  });
  const hoveredCard = deckLayouts.find((card) => card.isHovered) ?? null;
  const handHoveredCardId = resolveHoveredCardId({
    spread,
    drawnCards: drawnCardsState,
    pointerWorld,
    hoveredCardId: null,
    deckOrder,
    fanOpen
  });
  const drawnCards = resolveDrawnCards(drawnCardsState, spread);
  const hasRevealedCards = drawnCards.some((draw) => draw.isRevealed);
  const isRevealReady = selectionLocked && !hasRevealedCards;

  const clearRoundState = useCallback(() => {
    setDrawnCardsState([]);
    setFanOpen(false);
    setDeckOrder(tarotDeck.map((card) => card.id));
    setRevealedSession(null);
    setPersistenceState({
      status: 'idle',
      message: '尚未生成结果页。'
    });
    hoverSelectionState.current = {
      cardId: null,
      startedAt: 0
    };
    lastSelectionAt.current = 0;
    revealInFlight.current = false;
  }, []);

  useEffect(() => {
    clearRoundState();
  }, [activeSpreadId, clearRoundState]);

  const attemptSelectCard = useCallback(
    (cardId: string | null, timestamp: number) => {
      if (!fanOpen || !cardId || selectionLocked) {
        return;
      }

      if (!tarotDeckMap.has(cardId)) {
        return;
      }

      if (timestamp - lastSelectionAt.current <= 420) {
        return;
      }

      setDrawnCardsState((current) => {
        if (
          current.some((draw) => draw.cardId === cardId) ||
          current.length >= spread.cardCount
        ) {
          return current;
        }

        return [
          ...current,
          {
            cardId,
            selectionIndex: current.length,
            isRevealed: false,
            isReversed: Math.random() >= 0.5,
            selectedAt: new Date().toISOString(),
            revealedAt: null
          }
        ];
      });

      lastSelectionAt.current = timestamp;
    },
    [fanOpen, selectionLocked, spread.cardCount]
  );

  const revealSelection = useCallback(async () => {
    if (
      revealInFlight.current ||
      !isRevealReady ||
      drawnCards.length !== spread.cardCount
    ) {
      return null;
    }

    revealInFlight.current = true;

    const revealedAt = new Date().toISOString();
    const nextDrawnState = drawnCardsState.map((draw) => ({
      ...draw,
      isRevealed: true,
      revealedAt
    }));

    setDrawnCardsState(nextDrawnState);

    const nextResolvedDraws = resolveDrawnCards(nextDrawnState, spread);
    const session = createSpreadSession({
      spread,
      drawnCards: nextResolvedDraws,
      revealedAt
    });

    setRevealedSession(session);
    setPersistenceState({
      status: 'saving',
      message: '正在同步结果页...'
    });

    const persisted = await persistSpreadSession(session);

    setRevealedSession(persisted.session);
    setPersistenceState({
      status: persisted.source === 'cloud' ? 'cloud' : 'local',
      message:
        persisted.source === 'cloud'
          ? '结果页已同步到 Supabase，可跨设备访问。'
          : persisted.error
            ? `云端同步失败，当前先保存在本地：${persisted.error}`
            : '未配置 Supabase，当前结果先保存在本地。'
    });

    revealInFlight.current = false;

    return persisted.session;
  }, [drawnCards.length, drawnCardsState, isRevealReady, spread]);

  useEffect(() => {
    const pinchStarted = frame.pointer?.pinchStarted ?? false;

    if (!pinchStarted) {
      return;
    }

    if (selectionLocked && hasRevealedCards && revealedSession) {
      onViewResults(revealedSession.sharePath);
      return;
    }

    if (selectionLocked && !hasRevealedCards) {
      void revealSelection();
      return;
    }
  }, [
    frame.pointer?.pinchStarted,
    hasRevealedCards,
    onViewResults,
    revealSelection,
    revealedSession,
    selectionLocked
  ]);

  useEffect(() => {
    const timestamp = frame.pointer?.timestamp ?? 0;

    if (!fanOpen || selectionLocked || !frame.pointer || !pointerWorld) {
      hoverSelectionState.current = {
        cardId: null,
        startedAt: 0
      };
      return;
    }

    const currentHover = hoverSelectionState.current;
    const focusedLayout = currentHover.cardId
      ? deckLayouts.find((card) => card.id === currentHover.cardId) ?? null
      : null;
    const canSustainCurrentFocus = focusedLayout
      ? distance2D(pointerWorld, focusedLayout.position) <=
        HOVER_SELECT_SUSTAIN_RADIUS
      : false;

    if (!currentHover.cardId) {
      if (!handHoveredCardId) {
        return;
      }

      hoverSelectionState.current = {
        cardId: handHoveredCardId,
        startedAt: timestamp
      };
      return;
    }

    if (!canSustainCurrentFocus) {
      if (!handHoveredCardId) {
        hoverSelectionState.current = {
          cardId: null,
          startedAt: 0
        };
        return;
      }

      if (currentHover.cardId !== handHoveredCardId) {
        hoverSelectionState.current = {
          cardId: handHoveredCardId,
          startedAt: timestamp
        };
        return;
      }
    }

    if (timestamp - currentHover.startedAt < HOVER_SELECT_DWELL_MS) {
      return;
    }

    attemptSelectCard(currentHover.cardId, timestamp);
    hoverSelectionState.current = {
      cardId: currentHover.cardId,
      startedAt: timestamp + 999999
    };
  }, [
    attemptSelectCard,
    deckLayouts,
    fanOpen,
    frame.pointer,
    frame.pointer?.timestamp,
    handHoveredCardId,
    pointerWorld,
    selectionLocked
  ]);

  useEffect(() => {
    if (!selectIntent) {
      return;
    }

    attemptSelectCard(selectIntent.cardId, selectIntent.timestamp);
  }, [attemptSelectCard, selectIntent]);

  useEffect(() => {
    if (!revealIntent?.cardId) {
      return;
    }

    const target = drawnCardsState.find(
      (draw) => draw.cardId === revealIntent.cardId && !draw.isRevealed
    );

    if (target) {
      void revealSelection();
    }
  }, [drawnCardsState, revealIntent, revealSelection]);

  const resetSelection = useCallback(() => {
    clearRoundState();
  }, [clearRoundState]);

  const shuffleDeck = useCallback(() => {
    const timestamp = performance.now();

    if (timestamp - lastShuffleAt.current <= 900) {
      return;
    }

    clearRoundState();
    setFanOpen(true);
    setDeckOrder(fisherYates(tarotDeck.map((card) => card.id)));
    setShuffleMotionKey((current) => current + 1);
    lastShuffleAt.current = timestamp;
  }, [clearRoundState]);

  return {
    activeSpreadId,
    spread,
    spreadList,
    setActiveSpreadId,
    drawnCards,
    hasHoveredCard: Boolean(hoveredCard),
    deckLayouts,
    selectionLocked,
    remainingCount: Math.max(spread.cardCount - drawnCardsState.length, 0),
    deckCount: tarotDeck.length,
    resetSelection,
    revealSelection,
    isRevealReady,
    hasRevealedCards,
    revealedSession,
    persistenceState,
    shuffleMotionKey,
    shuffleDeck,
    fanOpen
  };
}

function resolveDrawnCards(
  drawnCardsState: DrawnCardState[],
  spread: { id: string; slots: Array<{ id: string }> }
): ResolvedDrawnCard[] {
  return drawnCardsState
    .map((draw) => {
      const card = tarotDeckMap.get(draw.cardId);

      if (!card) {
        return null;
      }

      return {
        ...draw,
        card,
        slotId:
          spread.slots[draw.selectionIndex]?.id ??
          `${spread.id}-slot-${draw.selectionIndex + 1}`
      };
    })
    .filter((draw): draw is ResolvedDrawnCard => draw !== null);
}

function fisherYates(values: string[]) {
  const next = [...values];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const value = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = value;
  }

  return next;
}

function distance2D(
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
