import { useState } from 'react';
import { AuraBackdrop } from '../components/AuraBackdrop';
import { ResultSpread } from './ResultSpread';
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
        <AuraBackdrop />
        <div className="result-frame">
          <div className="result-card result-card--empty">
            <p className="eyebrow">AuraTarot / Result</p>
            <h1>正在召回结果页</h1>
            <p className="panel-copy">
              正在读取这次抽牌的记录，请稍候。
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="result-shell">
        <AuraBackdrop />
        <div className="result-frame">
          <div className="result-card result-card--empty">
            <p className="eyebrow">AuraTarot / Result</p>
            <h1>结果页不存在</h1>
            <p className="panel-copy">
              暂时没有找到这次牌阵。如果它仅保存在本地，请使用原来的设备和浏览器查看。
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

  return (
    <main className="result-shell">
      <AuraBackdrop />
      <div className="result-frame">
        <section className="result-card result-card--hero">
          <p className="eyebrow">AuraTarot / Revealed Spread</p>
          <h1>{session.spread.label}</h1>
          <p className="result-quote">{session.quote}</p>
          <div className="result-meta">
            <span>揭示时间：{formatDateTime(session.revealedAt)}</span>
            <span>{session.persistence.cloudBacked ? '已保存，可通过链接分享' : '已保存在此设备'}</span>
          </div>
          {!session.persistence.cloudBacked ? (
            <p className="result-error">
              这次牌阵暂未同步，链接目前仅能在此设备的同一浏览器中查看。
            </p>
          ) : null}
          <details className="result-details"><summary>保存详情</summary>
            <p>记录：{session.id} · 来源：{source === 'cloud' ? '云端' : '本地'}</p>
            {session.persistence.lastSyncError && <p>{session.persistence.lastSyncError}</p>}
          </details>
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
          <ResultSpread session={session} />
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
