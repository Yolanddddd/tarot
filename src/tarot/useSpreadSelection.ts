import { useCallback, useEffect, useRef, useState } from 'react';
import { spreadList, spreadMap, type SpreadId } from '../config/spreads';
import type { HandTrackingFrame } from '../gesture/types';
import type { InteractionIntent } from '../interaction/types';
import { createSpreadSession } from '../results/session';
import { persistSpreadSession } from '../results/repository';
import type { SpreadSession } from '../results/types';
import { tarotDeck, tarotDeckMap } from './tarotDeck';
import type { DrawnCardState, ResolvedDrawnCard } from './types';

interface PersistenceState { status: 'idle' | 'saving' | 'cloud' | 'local' | 'error'; message: string }
interface Options {
  frame: HandTrackingFrame;
  handHoveredCardId: string | null;
  selectIntent: InteractionIntent | null;
}

export function useSpreadSelection({ frame, handHoveredCardId, selectIntent }: Options) {
  const [activeSpreadId, setActiveSpreadId] = useState<SpreadId>('futureCross');
  const [drawnCardsState, setDrawnCardsState] = useState<DrawnCardState[]>([]);
  const [fanOpen, setFanOpen] = useState(false);
  const [deckOrder, setDeckOrder] = useState(() => tarotDeck.map((card) => card.id));
  const [revealedSession, setRevealedSession] = useState<SpreadSession | null>(null);
  const [persistenceState, setPersistenceState] = useState<PersistenceState>({ status: 'idle', message: '' });
  const [shuffleMotionKey, setShuffleMotionKey] = useState(0);
  const hover = useRef<{ id: string | null; since: number }>({ id: null, since: 0 });
  const lastSelectionAt = useRef(-Infinity);
  const lastShuffleAt = useRef(-Infinity);
  const revealInFlight = useRef(false);
  const generation = useRef(0);
  const handledIntent = useRef(0);
  const handledPinch = useRef(-Infinity);
  const spread = spreadMap[activeSpreadId];
  const selectionLocked = drawnCardsState.length >= spread.cardCount;
  const drawnCards: ResolvedDrawnCard[] = drawnCardsState.map((draw) => ({
    ...draw, card: tarotDeckMap.get(draw.cardId)!, slotId: spread.slots[draw.selectionIndex]?.id ?? ''
  }));
  const hasRevealedCards = drawnCardsState.some((draw) => draw.isRevealed);
  const isRevealReady = selectionLocked && !hasRevealedCards;

  const clearRoundState = useCallback(() => {
    generation.current += 1;
    setDrawnCardsState([]);
    setFanOpen(false);
    setDeckOrder(tarotDeck.map((card) => card.id));
    setRevealedSession(null);
    setPersistenceState({ status: 'idle', message: '' });
    hover.current = { id: null, since: 0 };
    lastSelectionAt.current = -Infinity;
    revealInFlight.current = false;
  }, []);
  useEffect(clearRoundState, [activeSpreadId, clearRoundState]);

  const attemptSelectCard = useCallback((cardId: string | null, timestamp: number) => {
    if (!fanOpen || !cardId || selectionLocked || !tarotDeckMap.has(cardId) ||
      timestamp - lastSelectionAt.current < 280 || revealInFlight.current) return;
    setDrawnCardsState((current) => {
      if (current.some((draw) => draw.cardId === cardId) || current.length >= spread.cardCount) return current;
      return [...current, { cardId, selectionIndex: current.length, isRevealed: false,
        isReversed: Math.random() >= 0.5, selectedAt: new Date().toISOString(), revealedAt: null }];
    });
    lastSelectionAt.current = timestamp;
  }, [fanOpen, selectionLocked, spread.cardCount]);

  const revealSelection = useCallback(async () => {
    if (revealInFlight.current || !isRevealReady) return;
    revealInFlight.current = true;
    const round = generation.current;
    const revealedAt = new Date().toISOString();
    const next = drawnCards.map((draw) => ({ ...draw, isRevealed: true, revealedAt }));
    setDrawnCardsState(next);
    const session = createSpreadSession({ spread, drawnCards: next, revealedAt });
    setRevealedSession(session);
    setPersistenceState({ status: 'saving', message: '正在保存这次牌阵…' });
    try {
      const persisted = await persistSpreadSession(session);
      if (round !== generation.current) return;
      setRevealedSession(persisted.session);
      setPersistenceState({ status: persisted.source, message: persisted.source === 'cloud' ? '牌阵已保存' : '牌阵已保存在此设备' });
    } catch {
      if (round !== generation.current) return;
      setDrawnCardsState(drawnCards.map((draw) => ({ ...draw, isRevealed: false, revealedAt: null })));
      setRevealedSession(null);
      setPersistenceState({ status: 'error', message: '保存未完成，请再次开启结果。已选牌会保留。' });
    } finally {
      if (round === generation.current) revealInFlight.current = false;
    }
  }, [drawnCards, isRevealReady, spread]);

  useEffect(() => {
    if (!selectIntent || selectIntent.id === handledIntent.current) return;
    handledIntent.current = selectIntent.id;
    attemptSelectCard(selectIntent.cardId, selectIntent.timestamp);
  }, [attemptSelectCard, selectIntent]);

  useEffect(() => {
    const pointer = frame.pointer;
    if (!pointer || !fanOpen || selectionLocked || !handHoveredCardId) {
      hover.current = { id: null, since: 0 }; return;
    }
    if (hover.current.id !== handHoveredCardId) hover.current = { id: handHoveredCardId, since: pointer.timestamp };
    if (pointer.pinchStarted || pointer.timestamp - hover.current.since >= 2000) {
      attemptSelectCard(handHoveredCardId, pointer.timestamp);
      hover.current = { id: null, since: 0 };
    }
  }, [frame.pointer, fanOpen, selectionLocked, handHoveredCardId, attemptSelectCard]);

  useEffect(() => {
    const pointer = frame.pointer;
    if (!pointer?.pinchStarted || pointer.timestamp === handledPinch.current) return;
    handledPinch.current = pointer.timestamp;
    if (isRevealReady) void revealSelection();
  }, [frame.pointer, isRevealReady, revealSelection]);

  const shuffleDeck = useCallback(() => {
    const timestamp = performance.now();
    if (timestamp - lastShuffleAt.current < 1000 || revealInFlight.current) return;
    clearRoundState();
    const order = tarotDeck.map((card) => card.id);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    setDeckOrder(order);
    setFanOpen(true);
    setShuffleMotionKey((key) => key + 1);
    lastShuffleAt.current = timestamp;
  }, [clearRoundState]);

  return { activeSpreadId, setActiveSpreadId, spread, spreadList, drawnCards, deckOrder,
    fanOpen, selectionLocked, hasRevealedCards, isRevealReady, revealedSession,
    persistenceState, shuffleMotionKey, shuffleDeck, resetSelection: clearRoundState, revealSelection };
}
