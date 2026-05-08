import type { SpreadId } from '../config/spreads';
import type { SpreadDefinition } from '../tarot/types';

interface HudPanelProps {
  activeSpreadId: SpreadId;
  spread: SpreadDefinition;
  spreadList: SpreadDefinition[];
  onSelectSpread: (spreadId: SpreadId) => void;
}

export function HudPanel({
  activeSpreadId,
  spread,
  spreadList,
  onSelectSpread
}: HudPanelProps) {
  return (
    <div className="hud-shell">
      <div className="hud-panel hud-panel--floating">
        <p className="eyebrow">AuraTarot / Divination Space</p>
        <div className="hud-panel__header">
          <h1>{spread.label}</h1>
          <p className="ritual-hint">使用手势捏合或鼠标点击来挑选你的卡牌。</p>
        </div>
        <div className="spread-selector spread-selector--floating">
          {spreadList.map((item) => (
            <button
              className={`spread-chip ${
                item.id === activeSpreadId ? 'spread-chip--active' : ''
              }`}
              key={item.id}
              onClick={() => {
                onSelectSpread(item.id as SpreadId);
              }}
              type="button"
            >
              <strong>{item.label}</strong>
              <span>{item.cardCount} 张</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
