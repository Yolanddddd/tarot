import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { HandPointer } from '../gesture/types';
import type { InputSource } from '../interaction/types';
import { useElementSize } from '../interaction/useElementSize';
import { getTableLayout } from '../tarot/tableLayout';
import type { ResolvedDrawnCard, SpreadDefinition } from '../tarot/types';
import { runtimeConfig } from '../config/runtime';
import { CardBack } from './CardBack';
import { TarotCardImage } from './TarotCardImage';

interface Props {
  deckOrder: string[];
  drawnCards: ResolvedDrawnCard[];
  spread: SpreadDefinition;
  fanOpen: boolean;
  shuffleMotionKey: number;
  handPointer: HandPointer | null;
  disabled: boolean;
  onSelect: (cardId: string, source: InputSource) => void;
  onHandHover: (id: string | null) => void;
  onShuffle: () => void;
}

export function TarotTable({ deckOrder, drawnCards, spread, fanOpen, shuffleMotionKey,
  handPointer, disabled, onSelect, onHandHover, onShuffle }: Props) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [focused, setFocused] = useState<number | null>(null);
  const [animation, setAnimation] = useState<'idle' | 'gather' | 'spread'>('idle');
  const [pointerKind, setPointerKind] = useState(() => matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse');
  const manualUntil = useRef(0);
  const drag = useRef<{ id: number; x: number; y: number; index: number; repeat: boolean; moved: boolean } | null>(null);
  const drawnById = useMemo(() => new Map(drawnCards.map((draw) => [draw.cardId, draw])), [drawnCards]);
  const full = drawnCards.length >= spread.cardCount;
  const layout = getTableLayout(width, height, spread.slots, deckOrder.length, focused);
  const baseLayout = getTableLayout(width, height, spread.slots, deckOrder.length, null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    setFocused(null); drag.current = null;
    if (!fanOpen || shuffleMotionKey === 0) { setAnimation('idle'); return; }
    setAnimation('gather');
    const spreadTimer = window.setTimeout(() => setAnimation('spread'), 160);
    const endTimer = window.setTimeout(() => setAnimation('idle'), 900);
    return () => { window.clearTimeout(spreadTimer); window.clearTimeout(endTimer); };
  }, [shuffleMotionKey, fanOpen, spread.id]);

  const nearest = (x: number, useBase: boolean) => {
    const placements = useBase ? baseLayout.deck : layoutRef.current.deck;
    let nearestIndex: number | null = null;
    let distance = Infinity;
    placements.forEach((card, index) => {
      if (drawnById.has(deckOrder[index])) return;
      if (Math.abs(card.x - x) < distance) { distance = Math.abs(card.x - x); nearestIndex = index; }
    });
    return nearestIndex;
  };

  useEffect(() => {
    if (!handPointer || !fanOpen || full || disabled || animation !== 'idle' || performance.now() < manualUntil.current) {
      onHandHover(null); return;
    }
    const x = (handPointer.world.x / (runtimeConfig.sceneBounds.x * 2) + 0.5) * width;
    const y = (0.5 - handPointer.world.y / (runtimeConfig.sceneBounds.y * 2)) * height;
    const deck = baseLayout.deck;
    if (!deck[0] || Math.abs(y - layout.deckY) > deck[0].height * 0.95) { onHandHover(null); return; }
    const index = nearest(x, true);
    setFocused(index);
    onHandHover(index === null ? null : deckOrder[index]);
  }, [handPointer, fanOpen, full, disabled, animation, width, height, deckOrder, drawnById, onHandHover]);

  const choose = (index: number | null, source: InputSource) => {
    if (index === null || full || disabled || !fanOpen || animation !== 'idle' || drawnById.has(deckOrder[index])) return;
    onSelect(deckOrder[index], source);
    setFocused(null);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || full || animation !== 'idle' || drag.current) return;
    if (!fanOpen) { onShuffle(); return; }
    manualUntil.current = performance.now() + 1800;
    setPointerKind(event.pointerType);
    const bounds = ref.current!.getBoundingClientRect();
    // Mouse hover has already raised the intended card; do not retarget after
    // its neighbors have moved. A finger's second tap uses the expanded layout.
    const index = event.pointerType === 'mouse' && focused !== null
      ? focused : nearest(event.clientX - bounds.left, false);
    if (index === null) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, index,
      repeat: focused === index || event.pointerType === 'mouse', moved: false };
    setFocused(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!fanOpen || full || disabled || animation !== 'idle') return;
    manualUntil.current = performance.now() + 1800;
    const current = drag.current;
    if (current) {
      if (event.pointerId !== current.id) return;
      if (Math.abs(event.clientX - current.x) >= 10 || Math.abs(event.clientY - current.y) >= 10) current.moved = true;
      const steps = Math.round((event.clientX - current.x) / 22);
      const direction = steps >= 0 ? 1 : -1;
      let index = Math.max(0, Math.min(deckOrder.length - 1, current.index + steps));
      while (drawnById.has(deckOrder[index]) && index > 0 && index < deckOrder.length - 1) index += direction;
      setFocused(index);
    } else if (event.pointerType === 'mouse') {
      setFocused(nearest(event.clientX - ref.current!.getBoundingClientRect().left, true));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.id) return;
    drag.current = null;
    const tapped = Math.abs(event.clientX - current.x) < 10 && Math.abs(event.clientY - current.y) < 10;
    // A drag only previews: even a swipe that returns to its start needs a new tap.
    if (tapped && !current.moved && current.repeat) choose(current.index, event.pointerType === 'touch' ? 'touch' : 'mouse');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const hint = animation !== 'idle' ? '让思绪沉静，让牌重新相遇'
    : full ? '牌阵已齐 · 开启你的结果'
    : !fanOpen ? '轻点洗牌，展开你的 78 张牌'
    : focused !== null && pointerKind !== 'mouse' ? '轻点浮起的牌，确认选择'
    : pointerKind === 'mouse' ? '78 张一字展开 · 随心选择' : '左右滑动浮起卡牌 · 再轻点确认';

  return <section className="table-stage" aria-label={`${spread.label}选牌桌`}>
    <div className={`tarot-table ${layout.dots ? 'tarot-table--dots' : ''}`} ref={ref} data-animation={animation}>
      <div className="spread-guide" role="img" aria-label={`${spread.label}，${spread.cardCount} 个原始牌位`}>
        {layout.spread.map((slot, i) => <div key={spread.slots[i].id}
          className={`spread-slot ${i < drawnCards.length ? 'spread-slot--filled' : ''}`}
          data-slot={i} style={{ left: slot.x, top: slot.y, width: layout.dots ? 10 : slot.width, height: layout.dots ? 10 : slot.height }}>
          <span className="spread-slot__number">{i + 1}</span>
        </div>)}
      </div>
      {width > 0 && deckOrder.map((id, index) => {
        const draw = drawnById.get(id);
        const slot = draw ? layout.spread[draw.selectionIndex] : null;
        const stack = !fanOpen || animation === 'gather';
        const card = slot ? (layout.dots ? { ...slot, width: 10, height: 10 } : slot) : layout.deck[index];
        const x = !draw && stack ? width / 2 + (index % 4 - 1.5) * 0.45 : card.x;
        const y = !draw && stack ? layout.deckY - Math.min(index, 12) * 0.18 : card.y;
        const style: CSSProperties = {
          width: card.width, height: card.height,
          transform: `translate(${x - card.width / 2}px, ${y - card.height / 2}px)`,
          zIndex: draw ? 250 + draw.selectionIndex : focused === index ? 240 : 100 - index,
          transitionDelay: animation === 'spread' ? `${index * 1.5}ms` : '0ms'
        };
        return <div key={id} aria-hidden="true" data-card-index={index} data-selected={Boolean(draw)}
          className={`table-card ${draw ? 'table-card--selected' : ''} ${focused === index && !draw ? 'table-card--focused' : ''}`}
          style={style}>
          {draw?.isRevealed ? <TarotCardImage cardId={id} label={draw.card.label} alt=""
            className={`table-card__face ${draw.isReversed ? 'table-card__face--reversed' : ''}`} /> : <CardBack />}
        </div>;
      })}
      <button type="button" className="deck-touch-surface"
        style={{ top: Math.max(layout.spreadHeight + 2, layout.deckY - (layout.deck[0]?.height ?? 80) / 2 - 42), bottom: 0 }}
        aria-label={!fanOpen ? '洗牌并展开 78 张牌' : `选择牌堆中的卡牌，左右方向键挑选，回车抽取。已选 ${drawnCards.length} 张`}
        aria-disabled={disabled || full || animation !== 'idle'}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setFocused(null); }}
        onLostPointerCapture={() => { drag.current = null; }}
        onPointerLeave={(event) => { if (!drag.current && event.pointerType === 'mouse') setFocused(null); }}
        onKeyDown={(event) => {
          if (disabled || full || animation !== 'idle') return;
          if (!fanOpen && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onShuffle(); return; }
          if (!fanOpen) return;
          manualUntil.current = performance.now() + 1800;
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const direction = event.key === 'ArrowLeft' || event.key === 'End' ? -1 : 1;
            let index = event.key === 'Home' ? 0 : event.key === 'End' ? 77
              : Math.max(0, Math.min(77, (focused ?? 38) + direction));
            while (drawnById.has(deckOrder[index]) && index > 0 && index < 77) index += direction;
            setFocused(index);
          } else if (['Enter', ' '].includes(event.key)) { event.preventDefault(); choose(focused, 'mouse'); }
          else if (event.key === 'Escape') setFocused(null);
        }} />
      <span className="sr-only" aria-live="polite">{focused === null ? '' : `第 ${focused + 1} 张牌背`}</span>
      {handPointer && <span className="hand-light" aria-hidden="true" style={{
        left: `${(handPointer.world.x / (runtimeConfig.sceneBounds.x * 2) + 0.5) * 100}%`,
        top: `${(0.5 - handPointer.world.y / (runtimeConfig.sceneBounds.y * 2)) * 100}%`
      }} />}
    </div>
    <p className="table-hint" aria-live="polite">{hint}</p>
  </section>;
}
