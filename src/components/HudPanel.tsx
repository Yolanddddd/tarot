import type { SpreadId } from '../config/spreads';
import type { SpreadDefinition } from '../tarot/types';
import { fitSpread } from '../tarot/tableLayout';

interface Props {
  activeSpreadId: SpreadId;
  spreadList: SpreadDefinition[];
  onSelectSpread: (id: SpreadId) => void;
  disabled: boolean;
  onReset: () => void;
  touchDevice: boolean;
  gestureEnabled: boolean;
  gestureBusy: boolean;
  onToggleGesture: () => void;
}

export function HudPanel({ activeSpreadId, spreadList, onSelectSpread, disabled, onReset,
  touchDevice, gestureEnabled, gestureBusy, onToggleGesture }: Props) {
  return <header className="reading-header">
    <div className="brand" aria-label="AuraTarot">
      <span className="brand__mark" aria-hidden="true">∞</span>
      <div><span className="brand__name">AURATAROT</span><span className="brand__caption">/ DIVINATION SPACE</span></div>
    </div>
    <nav className="spread-picker" aria-label="选择牌阵">
      {spreadList.map((spread) => <button type="button" key={spread.id} className="spread-choice"
        disabled={disabled} aria-pressed={spread.id === activeSpreadId}
        onClick={() => onSelectSpread(spread.id as SpreadId)}>
        <svg className="spread-choice__symbol" viewBox="0 0 30 30" aria-hidden="true">
          {fitSpread(spread.slots, 30, 30, 3).map((slot, i) => <circle key={i} cx={slot.x} cy={slot.y} r="1.4" />)}
        </svg>
        <span>{spread.label}</span><small>{spread.cardCount}</small>
      </button>)}
    </nav>
    <label className="spread-select"><span className="sr-only">选择牌阵</span>
      <select value={activeSpreadId} disabled={disabled} onChange={(event) => onSelectSpread(event.target.value as SpreadId)}>
        {spreadList.map((spread) => <option key={spread.id} value={spread.id}>{spread.label} · {spread.cardCount} 张</option>)}
      </select>
    </label>
    <div className="header-actions">
      <button type="button" className="quiet-button gesture-button" onClick={onToggleGesture}
        aria-pressed={gestureEnabled} disabled={disabled || gestureBusy}>
        <span className="gesture-indicator" aria-hidden="true" />
        {gestureBusy ? '开启中' : touchDevice ? gestureEnabled ? '摇晃已开启' : '开启摇晃洗牌' : '摄像头手势'}
      </button>
      <button type="button" className="quiet-button reset-button" onClick={onReset} disabled={disabled} aria-label="重置本次牌阵">重置</button>
    </div>
  </header>;
}
