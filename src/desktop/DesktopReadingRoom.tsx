import { useEffect, useRef, useState } from 'react';
import { DesktopBottomAltarPanel } from '../components/DesktopBottomAltarPanel';
import { DesktopHudPanel } from '../components/DesktopHudPanel';
import { LightPointStage } from '../components/LightPointStage';
import { useHandTracking } from '../gesture/useHandTracking';
import type { InteractionIntent, InputSource } from '../interaction/types';
import { useDesktopSpreadSelection } from '../tarot/useDesktopSpreadSelection';

interface DesktopReadingRoomProps {
  onOpenResult: (sharePath: string) => void;
}

export function DesktopReadingRoom({ onOpenResult }: DesktopReadingRoomProps) {
  const frame = useHandTracking();
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [selectIntent, setSelectIntent] = useState<InteractionIntent | null>(
    null
  );
  const [revealIntent, setRevealIntent] = useState<InteractionIntent | null>(
    null
  );
  const intentId = useRef(0);
  const lastShuffleAt = useRef(0);
  const lastOpenedResultId = useRef<string | null>(null);
  const selection = useDesktopSpreadSelection({
    frame,
    hoveredCardId,
    selectIntent,
    revealIntent,
    onViewResults: onOpenResult
  });

  useEffect(() => {
    const pointer = frame.pointer;

    if (!pointer?.isShaking) {
      return;
    }

    if (pointer.timestamp - lastShuffleAt.current < 1100) {
      return;
    }

    selection.shuffleDeck();
    lastShuffleAt.current = pointer.timestamp;
  }, [
    frame.pointer,
    selection.shuffleDeck
  ]);

  useEffect(() => {
    if (
      !selection.hasRevealedCards ||
      !selection.revealedSession
    ) {
      lastOpenedResultId.current = null;
      return;
    }

    if (lastOpenedResultId.current === selection.revealedSession.id) {
      return;
    }

    lastOpenedResultId.current = selection.revealedSession.id;
    onOpenResult(selection.revealedSession.sharePath);
  }, [
    onOpenResult,
    selection.hasRevealedCards,
    selection.persistenceState.status,
    selection.revealedSession
  ]);

  const issueIntent = (cardId: string | null, source: InputSource) => ({
    id: intentId.current += 1,
    cardId,
    source,
    timestamp: performance.now()
  });

  return (
    <main className="app-shell">
      <div className="orbital-backdrop" />
      <div className="app-frame">
        <LightPointStage
          cards={selection.deckLayouts}
          handPointerWorld={frame.pointer?.world ?? null}
          isDeckStacked={!selection.fanOpen}
          onHoverCardChange={setHoveredCardId}
          onRevealIntent={(cardId, source) => {
            setRevealIntent(issueIntent(cardId, source));
          }}
          onSelectIntent={(cardId, source) => {
            setSelectIntent(issueIntent(cardId, source));
          }}
          onShuffleGesture={() => {
            selection.shuffleDeck();
          }}
          shuffleMotionKey={selection.shuffleMotionKey}
          spread={selection.spread}
        />
        <div className="vignette" />
        <DesktopHudPanel
          activeSpreadId={selection.activeSpreadId}
          onSelectSpread={selection.setActiveSpreadId}
          spread={selection.spread}
          spreadList={selection.spreadList}
        />
        <DesktopBottomAltarPanel
          cardCount={selection.spread.cardCount}
          hasRevealedCards={selection.hasRevealedCards}
          isRevealReady={selection.isRevealReady}
          onOpenResult={() => {
            if (!selection.revealedSession) {
              return;
            }

            onOpenResult(selection.revealedSession.sharePath);
          }}
          onReset={selection.resetSelection}
          onReveal={() => {
            void selection.revealSelection();
          }}
          onShuffle={selection.shuffleDeck}
          selectedCount={selection.drawnCards.length}
          spreadLabel={selection.spread.label}
        />
      </div>
    </main>
  );
}
