import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { removeReadingBySpreadResult } from '../reading/storage';
import type { ReadingBackground, ReadingSession } from '../reading/types';
import type { SpreadSession } from './types';

interface PrivateInterpretationData {
  overallMessage: string;
  cardReadings: Array<{ slotId: string; text: string }>;
  actions: string[];
  reflectionQuestions: string[];
}
interface PrivateResponse {
  question?: string;
  background?: ReadingBackground;
  interpretation?: PrivateInterpretationData;
  freeRemaining?: number;
  model?: string;
  pending?: boolean;
  error?: string;
  code?: string;
}
type AuthState = { token: string; userId: string } | null;

export function PrivateInterpretation({ session, candidate, canCreate, onSignIn, onDeleted }: {
  session: SpreadSession;
  candidate: ReadingSession | null;
  canCreate: boolean;
  onSignIn: () => void;
  onDeleted: () => void;
}) {
  const [auth, setAuth] = useState<AuthState>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<PrivateResponse | null>(null);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'generating' | 'ready' | 'absent' | 'error' | 'deleted'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void getSupabaseClient().then(async (client) => {
      if (!client) { if (active) setAuthChecked(true); return; }
      const { data: initial } = await client.auth.getSession();
      if (active) {
        setAuth(initial.session ? { token: initial.session.access_token, userId: initial.session.user.id } : null);
        setAuthChecked(true);
      }
      const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
        if (active) setAuth(next ? { token: next.access_token, userId: next.user.id } : null);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    }).catch(() => { if (active) setAuthChecked(true); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!authChecked || !auth || state === 'deleted') return;
    let cancelled = false;
    const belongsToUser = candidate?.ownerId === auth.userId;
    const mayCreate = Boolean(belongsToUser && canCreate);
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const request = async (method: 'GET' | 'POST') => {
      const response = await fetch(method === 'GET'
        ? `/api/private-interpret?sessionId=${encodeURIComponent(session.id)}`
        : '/api/private-interpret', {
        method,
        headers: { Authorization: `Bearer ${auth.token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        body: method === 'POST' && candidate ? JSON.stringify({
          sessionId: session.id, question: candidate.question, background: candidate.background
        }) : undefined
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`私人解读接口没有返回 JSON（HTTP ${response.status}）。请检查 Vercel 的 /api/private-interpret Function 和路由配置。`);
      }
      return { response, body: await response.json() as PrivateResponse };
    };

    const run = async () => {
      setData(null);
      setDataOwnerId(null);
      setError(null);
      setState('loading');
      try {
        let next = await request('GET');
        for (let tries = 0; tries < 32 && !cancelled; tries += 1) {
          if (next.response.ok && next.response.status !== 202 && next.body.interpretation) {
            setData(next.body); setDataOwnerId(auth.userId); setState('ready'); return;
          }
          if (next.response.status === 404) {
            if (!mayCreate) { setState('absent'); return; }
            setState('generating');
            next = await request('POST');
            continue;
          }
          if (next.response.status === 202) {
            setState('generating');
            await delay(3000);
            if (cancelled) return;
            next = await request('GET');
            continue;
          }
          if (next.response.status === 401) {
            throw new Error('登录验证未通过。请重试或重新登录；若仍失败，请联系站点管理员。');
          }
          throw new Error(next.body.error ?? '私人解读暂时不可用。');
        }
        if (!cancelled) throw new Error('解读等待超时，请稍后重试。');
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : '私人解读暂时不可用。');
        setState('error');
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [auth?.token, auth?.userId, authChecked, canCreate, candidate, retry, session.id, state === 'deleted']);

  if (!authChecked) return null;
  if (!auth) return <section className="result-card">
    <div className="panel-row"><span className="panel-label">私人 AI 解读</span><span className="panel-badge">仅本人可见</span></div>
    <p className="panel-copy">如果这是你提问的牌阵，登录后可查看或生成结合问题与背景的解读；分享访客看不到这些内容。</p>
    <button className="ghost-button" type="button" onClick={onSignIn}>登录查看我的解读</button>
  </section>;
  if (state === 'absent') return null;
  if (state === 'deleted') return <section className="result-card"><p className="panel-copy">云端私人记录和此浏览器中的提问已删除。免费使用次数不会退还。</p></section>;

  const interpretation = dataOwnerId === auth.userId ? data?.interpretation : null;
  return <section className="result-card" aria-live="polite">
    <div className="panel-row"><span className="panel-label">私人 AI 解读</span><span className="panel-badge">仅当前登录者可见</span></div>
    {state === 'loading' || state === 'generating' ? <p className="panel-copy">
      {state === 'loading' ? '正在读取你的私人解读…' : '正在结合问题、背景与牌位生成解读…'}
    </p> : null}
    {state === 'error' ? <><p className="result-error" role="alert">{error}</p>
      <button className="ghost-button" type="button" onClick={() => setRetry((value) => value + 1)}>重试私人解读</button>
      <button className="ghost-button" type="button" onClick={onSignIn}>重新登录</button></> : null}
    {state === 'ready' && interpretation ? <>
      <p className="result-quote">{data?.question}</p>
      <details className="result-details"><summary>你提供的背景 · 不公开</summary>
        {Object.entries(data?.background ?? {}).filter(([, value]) => value).map(([key, value]) =>
          <p key={key}>{backgroundLabel(key)}：{value}</p>)}
      </details>
      <h2>整体讯息</h2>
      <p className="panel-copy">{interpretation.overallMessage}</p>
      <h2>逐张解读</h2>
      <ol className="private-reading-list">{interpretation.cardReadings.map((item, index) => {
        const card = session.cards.find((entry) => entry.slotId === item.slotId);
        return <li key={item.slotId}><strong>{index + 1}. {card?.slotMeaning?.label ?? item.slotId}
          {card ? ` · ${card.label}（${card.isReversed ? '逆位' : '正位'}）` : ''}</strong>
          <p>{item.text}</p></li>;
      })}</ol>
      <h2>可以采取的行动</h2>
      <ul className="private-reading-points">{interpretation.actions.map((item) => <li key={item}>{item}</li>)}</ul>
      <h2>留给自己的问题</h2>
      <ul className="private-reading-points">{interpretation.reflectionQuestions.map((item) => <li key={item}>{item}</li>)}</ul>
      <p className="panel-copy">这是反思性提示，不保证录取、成绩、工作或未来结果。你的私人信息不会出现在分享链接中。</p>
      <p className="panel-badge">剩余免费私人解读：{data?.freeRemaining ?? '—'} 次</p>
      <div className="result-toolbar"><button className="ghost-button" type="button" disabled={deleting} onClick={async () => {
        if (!window.confirm('删除这次云端私人解读及此浏览器中的提问？免费次数不会退还。')) return;
        setDeleting(true);
        try {
          const response = await fetch(`/api/private-interpret?sessionId=${encodeURIComponent(session.id)}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` }
          });
          if (!response.ok) throw new Error('删除失败，请稍后重试。');
          removeReadingBySpreadResult(session.id);
          onDeleted();
          setData(null);
          setState('deleted');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : '删除失败。');
        } finally { setDeleting(false); }
      }}>{deleting ? '正在删除…' : '删除私人记录'}</button></div>
      {error ? <p className="result-error" role="alert">{error}</p> : null}
    </> : null}
  </section>;
}

function backgroundLabel(key: string) {
  return ({ stage: '当前阶段', region: '所在地区', timeframe: '关注时间',
    concern: '主要顾虑', context: '补充背景' } as Record<string, string>)[key] ?? key;
}
