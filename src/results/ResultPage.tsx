import { useState } from 'react';
import { TarotCardImage } from '../components/TarotCardImage';
import { buildShareUrl } from './session';
import type { SpreadSession } from './types';

interface ResultPageProps {
  session: SpreadSession | null;
  onReturn: () => void;
  loading: boolean;
  error: string | null;
  source: 'local' | 'cloud' | 'none';
}

export function ResultPage({
  session,
  onReturn,
  loading,
  error,
  source
}: ResultPageProps) {
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <main className="result-shell">
        <div className="result-frame">
          <div className="result-card result-card--empty">
            <p className="eyebrow">AuraTarot / Result</p>
            <h1>正在召回结果页</h1>
            <p className="panel-copy">
              正在从本地或 Supabase 读取这次抽牌的会话记录，请稍候。
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="result-shell">
        <div className="result-frame">
          <div className="result-card result-card--empty">
            <p className="eyebrow">AuraTarot / Result</p>
            <h1>结果页不存在</h1>
            <p className="panel-copy">
              当前链接没有在本地找到对应的揭示记录，可能是浏览器缓存已清空，
              或者 Supabase 还没有配置完成。
            </p>
            {error ? <p className="result-error">{error}</p> : null}
            <div className="result-toolbar">
              <button className="primary-button" onClick={onReturn} type="button">
                返回抽牌空间
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const shareUrl = buildShareUrl(session.sharePath);
  const spreadBoardLayout = buildSpreadBoardLayout(session);

  return (
    <main className="result-shell">
      <div className="result-frame">
        <section className="result-card result-card--hero">
          <p className="eyebrow">AuraTarot / Revealed Spread</p>
          <h1>{session.spread.label}</h1>
          <p className="result-quote">{session.quote}</p>
          <div className="result-meta">
            <span>会话 ID：{session.id}</span>
            <span>揭示时间：{formatDateTime(session.revealedAt)}</span>
            <span>
              读取来源：
              {source === 'cloud'
                ? 'Supabase'
                : source === 'local'
                  ? '本地缓存'
                  : '未知'}
            </span>
            <span>
              云端状态：
              {session.persistence.cloudBacked
                ? `已同步到 ${session.persistence.provider}`
                : '仅本地缓存'}
            </span>
          </div>
          {!session.persistence.cloudBacked &&
          session.persistence.lastSyncError ? (
            <p className="result-error">
              云端同步失败：{session.persistence.lastSyncError}
            </p>
          ) : !session.persistence.cloudBacked ? (
            <p className="result-error">
              云端同步尚未完成。若这里始终没有更具体的错误，通常表示当前访问的部署还不是最新版本。
            </p>
          ) : null}
          <div className="result-toolbar">
            <button className="primary-button" onClick={onReturn} type="button">
              返回抽牌空间
            </button>
            <button
              className="ghost-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  window.setTimeout(() => {
                    setCopied(false);
                  }, 1800);
                } catch {
                  setCopied(false);
                }
              }}
              type="button"
            >
              {copied ? '链接已复制' : '复制结果链接'}
            </button>
          </div>
        </section>

        <section className="result-card">
          <div className="panel-row">
            <span className="panel-label">分享链接</span>
            <span className="panel-badge">{session.cards.length} 张已揭示</span>
          </div>
          <p className="result-link">{shareUrl}</p>
        </section>

        <section className="result-card">
          <div className="panel-row">
            <span className="panel-label">牌阵复现</span>
            <span className="panel-badge">保持原始落位</span>
          </div>
          <div className="result-spread-board">
            {session.cards.map((card, index) => (
              <article
                className="result-spread-card"
                key={`${card.cardId}-${card.selectionIndex}`}
                style={{
                  left: `${spreadBoardLayout.positions[index].left}%`,
                  top: `${spreadBoardLayout.positions[index].top}%`,
                  zIndex: 20 + Math.round(card.slotPosition.z * 10)
                }}
              >
                <TarotCardImage
                  alt={card.label}
                  cardId={card.cardId}
                  className={`result-card-image result-card-image--spread ${
                    card.orientationLabel === 'reversed'
                      ? 'result-card-image--reversed'
                      : ''
                  }`}
                  label={card.label}
                />
                <div className="result-spread-chip">
                  <span>{index + 1}</span>
                  <span>{card.orientationLabel === 'reversed' ? '逆位' : '正位'}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function buildSpreadBoardLayout(session: SpreadSession) {
  const positions = session.cards.map((card) => card.slotPosition);
  const xValues = positions.map((position) => position.x);
  const yValues = positions.map((position) => position.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);
  const horizontalPadding = 18;
  const verticalPadding = 24;

  return {
    positions: session.cards.map((card) => ({
      left:
        horizontalPadding +
        ((card.slotPosition.x - minX) / xRange) * (100 - horizontalPadding * 2),
      top:
        verticalPadding +
        ((maxY - card.slotPosition.y) / yRange) * (100 - verticalPadding * 2)
    }))
  };
}
