import { useElementSize } from '../interaction/useElementSize';
import { fitSpread } from '../tarot/tableLayout';
import { TarotCardImage } from '../components/TarotCardImage';
import type { SpreadSession } from './types';

export function ResultSpread({ session }: { session: SpreadSession }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selectedIndex !== null) dialog.current?.showModal();
  }, [selectedIndex]);
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const placements = fitSpread(session.cards.map((card) => card.slotPosition), width, height, 28);
  const selected = selectedIndex === null ? null : session.cards[selectedIndex];
  return <><div className="result-spread-board" ref={ref} aria-label={`${session.spread.label}，原始牌阵`}>
    {width > 0 && session.cards.map((card, index) => <article className="result-spread-card"
      key={`${card.cardId}-${card.selectionIndex}`} style={{
        left: placements[index].x, top: placements[index].y, width: placements[index].width,
        zIndex: 20 + Math.round(card.slotPosition.z * 10)
      }}>
      <button type="button" className="result-card-button" aria-label={`放大第 ${index + 1} 张：${card.label}`}
        onClick={() => setSelectedIndex(index)}>
        <TarotCardImage alt={card.label} cardId={card.cardId} label={card.label}
          className={`result-card-image ${card.isReversed ? 'result-card-image--reversed' : ''}`} />
      </button>
      <div className="result-spread-chip"><span>{index + 1}</span><span>{card.isReversed ? '逆位' : '正位'}</span></div>
    </article>)}
  </div>
    <dialog className="result-dialog" ref={dialog} onClose={() => setSelectedIndex(null)} aria-labelledby="result-card-title">
      {selected && <>
        <div className="result-dialog__heading"><h2 id="result-card-title">{selected.label} · {selected.isReversed ? '逆位' : '正位'}</h2>
          <button type="button" className="quiet-button" onClick={() => dialog.current?.close()} aria-label="关闭放大卡牌">关闭</button>
        </div>
        <TarotCardImage cardId={selected.cardId} label={selected.label} alt={selected.label}
          className={`result-dialog__image ${selected.isReversed ? 'result-card-image--reversed' : ''}`} />
      </>}
    </dialog>
  </>;
}
import { useEffect, useRef, useState } from 'react';
