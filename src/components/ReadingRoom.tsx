import { useEffect, useRef, useState } from 'react';
import { HudPanel } from './HudPanel';
import { BottomAltarPanel } from './BottomAltarPanel';
import { AuraBackdrop } from './AuraBackdrop';
import { TarotTable } from './TarotTable';
import { useHandTracking } from '../gesture/useHandTracking';
import { useDeviceShake } from '../gesture/useDeviceShake';
import type { InteractionIntent, InputSource } from '../interaction/types';
import { useSpreadSelection } from '../tarot/useSpreadSelection';

export function ReadingRoom({ onOpenResult }: { onOpenResult: (path: string) => void }) {
  const [handEnabled, setHandEnabled] = useState(false);
  const [touchDevice, setTouchDevice] = useState(() => navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches);
  const frame = useHandTracking(handEnabled);
  const [handHoveredCardId, setHandHoveredCardId] = useState<string | null>(null);
  const [selectIntent, setSelectIntent] = useState<InteractionIntent | null>(null);
  const intentId = useRef(0);
  const opened = useRef<string | null>(null);
  const lastHandShuffle = useRef(0);
  const selection = useSpreadSelection({ frame, handHoveredCardId, selectIntent });
  const saving = selection.persistenceState.status === 'saving';
  const canGestureShuffle = selection.drawnCards.length === 0 && !saving;
  const shake = useDeviceShake(selection.shuffleDeck, canGestureShuffle);

  useEffect(() => {
    const media = matchMedia('(pointer: coarse)');
    const update = () => setTouchDevice(navigator.maxTouchPoints > 0 || media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const pointer = frame.pointer;
    if (!canGestureShuffle || !pointer?.isShaking || pointer.timestamp - lastHandShuffle.current < 1800) return;
    lastHandShuffle.current = pointer.timestamp;
    selection.shuffleDeck();
  }, [frame.pointer, canGestureShuffle, selection.shuffleDeck]);

  useEffect(() => {
    if (!selection.revealedSession || saving || !selection.hasRevealedCards) return;
    if (opened.current === selection.revealedSession.id) return;
    opened.current = selection.revealedSession.id;
    onOpenResult(selection.revealedSession.sharePath);
  }, [selection.revealedSession, saving, selection.hasRevealedCards, onOpenResult]);

  const select = (cardId: string, source: InputSource) => {
    setSelectIntent({ id: ++intentId.current, cardId, source, timestamp: performance.now() });
  };
  const gestureMessage = touchDevice ? shake.message : handEnabled ? frame.message : '';

  return <main className="reading-room">
    <AuraBackdrop />
    <HudPanel activeSpreadId={selection.activeSpreadId} spreadList={selection.spreadList}
      onSelectSpread={selection.setActiveSpreadId} disabled={saving}
      onReset={selection.resetSelection} touchDevice={touchDevice}
      gestureEnabled={touchDevice ? shake.status === 'on' : handEnabled}
      gestureBusy={shake.status === 'requesting'}
      onToggleGesture={() => { if (touchDevice) void shake.toggle(); else setHandEnabled((value) => !value); }} />
    <section className="portrait-hint" aria-label="请横屏选牌">
      <div className="brand"><span className="brand__mark" aria-hidden="true">∞</span><div><span className="brand__name">AURATAROT</span><span className="brand__caption">/ DIVINATION SPACE</span></div></div>
      <div className="portrait-hint__message">
        <span className="portrait-hint__phone" aria-hidden="true">↻</span>
        <h1>请将手机横过来</h1>
        <p>横屏展开完整牌桌<br />左右滑动选牌，再轻点确认</p>
      </div>
      <p>横屏后进入选牌 · 已选牌会保留</p>
    </section>
    <TarotTable deckOrder={selection.deckOrder} drawnCards={selection.drawnCards} spread={selection.spread}
      fanOpen={selection.fanOpen} shuffleMotionKey={selection.shuffleMotionKey}
      disabled={saving} handPointer={frame.pointer} onHandHover={setHandHoveredCardId}
      onSelect={select} onShuffle={selection.shuffleDeck} />
    <BottomAltarPanel selectedCount={selection.drawnCards.length} cardCount={selection.spread.cardCount}
      spreadLabel={selection.spread.label} isRevealReady={selection.isRevealReady} saving={saving}
      onShuffle={selection.shuffleDeck} onReveal={() => { void selection.revealSelection(); }}
      message={['saving', 'error'].includes(selection.persistenceState.status) ? selection.persistenceState.message : gestureMessage} />
  </main>;
}
