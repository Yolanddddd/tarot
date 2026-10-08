import { useState } from 'react';
import { AuraBackdrop } from '../components/AuraBackdrop';
import { ResultSpread } from './ResultSpread';
import { isSpreadSessionSaving, persistSpreadSession } from './repository';
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
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

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
  const savingInBackground = isSpreadSessionSaving(session.id);

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
            <span>{session.persistence.cloudBacked ? '云端已保存，可分享' : session.persistence.lastSyncError ? '云端保存失败' : savingInBackground ? '正在保存到云端' : '尚未保存到云端'}</span>
          </div>
          {!session.persistence.cloudBacked ? (
            <p className="result-error">
              {session.persistence.lastSyncError
                ? '云端保存失败。结果仍可在此设备查看；请检查网络后点击“重试保存并复制链接”。'
                : savingInBackground
                  ? '结果已显示，正在保存到云端。保存成功前不能分享链接。'
                  : '结果仅在此设备可见；保存到云端后才能分享链接。'}
            </p>
          ) : null}
          <details className="result-details"><summary>保存详情</summary>
            <p>记录：{session.id} · 来源：{source === 'cloud' ? '云端' : '本地'}</p>
            {session.persistence.lastSyncError && <p>{session.persistence.lastSyncError}</p>}
          </details>
          {copyError ? <p className="result-error" role="alert">{copyError}</p> : null}
          <div className="result-toolbar">
            <button className="primary-button" onClick={onReturn} type="button">
              返回抽牌空间
            </button>
            <button
              className="ghost-button"
              onClick={async () => {
                if (copying) return;
                setCopying(true);
                setCopyError(null);
                try {
                  if (!session.persistence.cloudBacked) {
                    const result = await persistSpreadSession(session);
                    if (!result.session.persistence.cloudBacked) {
                      setCopyError(result.error ?? '云端保存未完成，请稍后重试。');
                      return;
                    }
                  }
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  window.setTimeout(() => {
                    setCopied(false);
                  }, 1800);
                } catch {
                  setCopied(false);
                  setCopyError('无法复制链接，请检查浏览器权限后重试。');
                } finally {
                  setCopying(false);
                }
              }}
              type="button"
              disabled={copying}
            >
              {copying ? '正在确认云端保存…' : copied ? '链接已复制' : session.persistence.cloudBacked ? '复制结果链接' : session.persistence.lastSyncError ? '重试保存并复制链接' : savingInBackground ? '保存完成后复制链接' : '保存到云端并复制链接'}
            </button>
          </div>
        </section>

        <section className="result-card">
          <div className="panel-row">
            <span className="panel-label">分享链接</span>
            <span className="panel-badge">{session.cards.length} 张已揭示</span>
          </div>
          <p className="result-link">{session.persistence.cloudBacked ? shareUrl : '云端保存成功后显示分享链接'}</p>
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
