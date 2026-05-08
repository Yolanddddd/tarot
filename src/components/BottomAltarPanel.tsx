interface BottomAltarPanelProps {
  spreadLabel: string;
  selectedCount: number;
  cardCount: number;
  isRevealReady: boolean;
  hasRevealedCards: boolean;
  onShuffle: () => void;
  onReset: () => void;
  onReveal: () => void;
  onOpenResult: () => void;
}

export function BottomAltarPanel({
  spreadLabel,
  selectedCount,
  cardCount,
  isRevealReady,
  hasRevealedCards,
  onShuffle,
  onReset,
  onReveal,
  onOpenResult
}: BottomAltarPanelProps) {
  const resultVisible = isRevealReady || hasRevealedCards;
  const resultLabel = hasRevealedCards ? '查看结果' : '开启结果';
  const resultGlyph = hasRevealedCards ? '✦' : '✺';

  return (
    <div className="altar-panel">
      <div className="altar-panel__controls">
        <button
          className="altar-button"
          onClick={onShuffle}
          type="button"
        >
          <span className="altar-button__glyph">↺</span>
          <span className="altar-button__label">洗牌</span>
        </button>

        {resultVisible ? (
          <button
            className="altar-button altar-button--primary altar-button--visible"
            onClick={() => {
              if (hasRevealedCards) {
                onOpenResult();
                return;
              }

              onReveal();
            }}
            type="button"
          >
            <span className="altar-button__glyph">{resultGlyph}</span>
            <span className="altar-button__label">{resultLabel}</span>
          </button>
        ) : (
          <div
            aria-live="polite"
            className="altar-progress"
          >
            <span className="altar-progress__label">{spreadLabel}</span>
            <span className="altar-progress__value">
              {selectedCount} / {cardCount}
            </span>
          </div>
        )}

        <button
          className="altar-button"
          onClick={onReset}
          type="button"
        >
          <span className="altar-button__glyph">↩</span>
          <span className="altar-button__label">重置</span>
        </button>
      </div>
    </div>
  );
}
