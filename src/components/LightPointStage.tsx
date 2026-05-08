import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point3D } from '../gesture/types';
import type { InputSource } from '../interaction/types';
import type { DeckCardLayout, SpreadDefinition } from '../tarot/types';
import { AuraScene } from '../three/auraScene';

interface LightPointStageProps {
  handPointerWorld: Point3D | null;
  isDeckStacked: boolean;
  cards: DeckCardLayout[];
  spread: SpreadDefinition;
  shuffleMotionKey: number;
  onHoverCardChange: (cardId: string | null) => void;
  onSelectIntent: (cardId: string | null, source: InputSource) => void;
  onRevealIntent: (cardId: string | null, source: InputSource) => void;
  onShuffleGesture: () => void;
}

export function LightPointStage({
  handPointerWorld,
  isDeckStacked,
  cards,
  spread,
  shuffleMotionKey,
  onHoverCardChange,
  onSelectIntent,
  onRevealIntent,
  onShuffleGesture
}: LightPointStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<AuraScene | null>(null);
  const cardsRef = useRef(cards);
  const handPointerWorldRef = useRef<Point3D | null>(handPointerWorld);
  const hoveredCardIdRef = useRef<string | null>(null);
  const manualInputTimeout = useRef<number | null>(null);
  const lastMouseShakeSample = useRef<{
    x: number;
    timestamp: number;
    direction: number;
    flips: number;
  } | null>(null);
  const lastShuffleAt = useRef(0);

  cardsRef.current = cards;
  handPointerWorldRef.current = handPointerWorld;

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const scene = new AuraScene(container);
    sceneRef.current = scene;

    const onResize = () => {
      scene.resize();
    };

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (manualInputTimeout.current !== null) {
      return;
    }

    sceneRef.current?.setPointerTarget(handPointerWorld);
  }, [handPointerWorld]);

  useEffect(() => {
    sceneRef.current?.setDeckState(cards, spread);
  }, [cards, spread]);

  useEffect(() => {
    if (shuffleMotionKey > 0) {
      sceneRef.current?.playShuffleChaos();
    }
  }, [shuffleMotionKey]);

  const clearManualOverride = () => {
    if (manualInputTimeout.current !== null) {
      window.clearTimeout(manualInputTimeout.current);
      manualInputTimeout.current = null;
    }

    hoveredCardIdRef.current = null;
    onHoverCardChange(null);

    if (containerRef.current) {
      containerRef.current.style.cursor = 'default';
    }

    sceneRef.current?.setPointerTarget(handPointerWorldRef.current);
  };

  const refreshManualOverride = () => {
    if (manualInputTimeout.current !== null) {
      window.clearTimeout(manualInputTimeout.current);
    }

    manualInputTimeout.current = window.setTimeout(() => {
      manualInputTimeout.current = null;
      hoveredCardIdRef.current = null;
      onHoverCardChange(null);

      if (containerRef.current) {
        containerRef.current.style.cursor = 'default';
      }

      sceneRef.current?.setPointerTarget(handPointerWorldRef.current);
    }, 1800);
  };

  const updatePointerFromViewport = (
    clientX: number,
    clientY: number,
    source: InputSource
  ) => {
    const result = sceneRef.current?.pickPointerTarget(clientX, clientY);

    if (!result) {
      return null;
    }

    sceneRef.current?.setPointerTarget(result.pointerWorld);
    refreshManualOverride();

    if (hoveredCardIdRef.current !== result.cardId) {
      hoveredCardIdRef.current = result.cardId;
      onHoverCardChange(result.cardId);
    }

    if (containerRef.current) {
      containerRef.current.style.cursor = result.cardId ? 'pointer' : 'default';
    }

    if (source === 'mouse') {
      trackMouseShake(clientX);
    }

    return result;
  };

  const trackMouseShake = (clientX: number) => {
    const timestamp = performance.now();
    const sample = lastMouseShakeSample.current;

    if (!sample) {
      lastMouseShakeSample.current = {
        x: clientX,
        timestamp,
        direction: 0,
        flips: 0
      };
      return;
    }

    const dx = clientX - sample.x;
    const dt = Math.max(timestamp - sample.timestamp, 1);
    const direction = Math.sign(dx);
    let flips = sample.flips;

    if (Math.abs(dx) > 18 && dt < 120) {
      if (sample.direction !== 0 && direction !== 0 && direction !== sample.direction) {
        flips += 1;
      } else {
        flips = Math.max(flips - 0.2, 0);
      }
    } else {
      flips = Math.max(flips - 0.35, 0);
    }

    if (flips >= 4 && timestamp - lastShuffleAt.current > 1300) {
      onShuffleGesture();
      lastShuffleAt.current = timestamp;
      flips = 0;
    }

    lastMouseShakeSample.current = {
      x: clientX,
      timestamp,
      direction,
      flips
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const source = event.pointerType === 'touch' ? 'touch' : 'mouse';
    updatePointerFromViewport(event.clientX, event.clientY, source);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const source = event.pointerType === 'touch' ? 'touch' : 'mouse';
    const result = updatePointerFromViewport(event.clientX, event.clientY, source);

    if (isDeckStacked && result?.pointerWorld) {
      const deckDistance = Math.hypot(result.pointerWorld.x, result.pointerWorld.y + 0.2);

      if (result.cardId || deckDistance <= 1.15) {
        onShuffleGesture();
        return;
      }
    }

    if (!result?.cardId) {
      return;
    }

    const targetCard =
      cardsRef.current.find((card) => card.id === result.cardId) ?? null;

    if (!targetCard) {
      return;
    }

    if (targetCard.isSelected && !targetCard.isRevealed) {
      onRevealIntent(result.cardId, source);
      return;
    }

    if (!targetCard.isSelected) {
      onSelectIntent(result.cardId, source);
    }
  };

  return (
    <div
      className="stage-canvas"
      onPointerLeave={clearManualOverride}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={containerRef}
    />
  );
}
