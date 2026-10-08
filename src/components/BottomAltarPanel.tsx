interface Props {
  spreadLabel: string;
  selectedCount: number;
  cardCount: number;
  isRevealReady: boolean;
  saving: boolean;
  onShuffle: () => void;
  onReveal: () => void;
  message: string;
}

export function BottomAltarPanel({ spreadLabel, selectedCount, cardCount, isRevealReady, saving, onShuffle, onReveal, message }: Props) {
  return <footer className="ritual-footer">
    <div className="ritual-controls">
      <button className="ritual-button" onClick={onShuffle} disabled={saving} type="button">
        <span aria-hidden="true">↻</span><span>洗牌</span>
      </button>
      <div className="ritual-progress" role="status" aria-label={`已选 ${selectedCount} 张，共 ${cardCount} 张`}>
        <span className="ritual-progress__value">{selectedCount}<span className="ritual-progress__divider">/</span>{cardCount}</span>
        <span className="ritual-progress__label">{spreadLabel}</span>
      </div>
      <button className="ritual-button ritual-button--primary" onClick={onReveal} disabled={!isRevealReady || saving} type="button">
        <span aria-hidden="true">✧</span><span>{saving ? '保存中' : '开启结果'}</span>
      </button>
    </div>
    <p className="gesture-status" role="status">{message || 'A quiet moment, a clearer mind.'}</p>
  </footer>;
}
