import { AuraBackdrop } from '../components/AuraBackdrop';
import { spreadList, spreadMap, type SpreadId } from '../config/spreads';
import type { ReadingSession } from './types';

const descriptions: Record<SpreadId, string> = {
  futureCross: '聚焦一个明确目标，梳理现状、阻碍、近期趋势与下一步。',
  hexagram: '适合多方因素交织的困惑，看看环境、内在想法与行动方向。',
  monthlyFlow: '从学业与事业、人际关系、自我状态三个维度观察这个月。'
};

export function RecommendationPage({ reading, onSelectSpread, onContinue, onBack }: {
  reading: ReadingSession | null;
  onSelectSpread: (id: SpreadId) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const selected = reading ? spreadMap[reading.routing.spreadId] : null;
  const recommendationLabel = reading?.routing.selectedByUser
    ? '你选择的牌阵'
    : reading?.routing.source === 'ai' ? 'AI 推荐牌阵' : '根据问题推荐';

  return <main className="recommendation-page">
    <AuraBackdrop />
    <header className="question-header"><span className="question-brand">∞ <span>AURATAROT</span></span><span>留学问途 · 选择牌阵</span></header>
    <section className="recommendation-panel" aria-labelledby="recommendation-title">
      {reading && selected ? <>
        <p className="eyebrow">A SPREAD FOR YOUR QUESTION</p>
        <h1 id="recommendation-title">先让牌阵回应你的问题</h1>
        <p className="recommendation-question">“{reading.question}”</p>
        <div className="recommendation-feature">
          <div className="recommendation-feature__symbol" aria-hidden="true">✦</div>
          <div>
            <p className="recommendation-kicker">{recommendationLabel}</p>
            <h2>{selected.label}<span>{selected.cardCount} 张牌</span></h2>
            <p className="recommendation-reason">{reading.routing.reason}</p>
            <p className="recommendation-description">{descriptions[selected.id as SpreadId]}</p>
          </div>
        </div>
        <div className="recommendation-choices" aria-label="选择牌阵">
          <p>想换一种角度？你也可以自己选择</p>
          <div className="recommendation-choices__grid">
            {spreadList.map((spread) => <button type="button" key={spread.id}
              className={spread.id === selected.id ? 'recommendation-choice recommendation-choice--selected' : 'recommendation-choice'}
              aria-pressed={spread.id === selected.id}
              onClick={() => onSelectSpread(spread.id as SpreadId)}>
              <span>{spread.cardCount} 张牌</span><strong>{spread.label}</strong>
              <small>{descriptions[spread.id as SpreadId]}</small>
            </button>)}
          </div>
        </div>
        <div className="recommendation-actions">
          <button className="recommendation-back" type="button" onClick={onBack}>返回修改问题</button>
          <button className="question-primary" type="button" onClick={onContinue}>进入抽牌空间 <span aria-hidden="true">✦</span></button>
        </div>
        <p className="recommendation-note">牌阵是理解问题的视角，不是对结果的保证。进入后仍可在抽牌前切换牌阵。</p>
      </> : <>
        <p className="eyebrow">AURATAROT / RECOMMENDATION</p>
        <h1 id="recommendation-title">还没有待解读的问题</h1>
        <p className="question-intro">先写下你的问题，我们才可以为它推荐牌阵。</p>
        <button className="question-primary" type="button" onClick={onBack}>返回提问页</button>
      </>}
    </section>
  </main>;
}
