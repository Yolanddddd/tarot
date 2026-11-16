import { useEffect, useState } from 'react';

interface InterpretationResponse {
  overall?: string;
  key?: string;
  cached?: boolean;
  pending?: boolean;
  error?: string;
}

interface Props {
  sessionId: string;
  canCreate: boolean;
}

export function AnonymousInterpretation({ sessionId, canCreate }: Props) {
  const [overall, setOverall] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'generating' | 'error' | 'absent'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const request = async (method: 'GET' | 'POST') => {
      const response = await fetch(method === 'GET'
        ? `/api/interpret?sessionId=${encodeURIComponent(sessionId)}` : '/api/interpret', {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify({ sessionId }) : undefined
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`解读接口没有返回 JSON（HTTP ${response.status}）。请检查 Vercel 的 /api/interpret Function 和路由配置。`);
      }
      const data = await response.json() as InterpretationResponse;
      return { response, data };
    };

    const run = async () => {
      setOverall(null);
      setKey(null);
      setError(null);
      setState('loading');
      try {
        const existing = await request('GET');
        if (cancelled) return;
        if (existing.response.ok && existing.data.overall) {
          setOverall(existing.data.overall);
          setKey(existing.data.key ?? null);
          setState('idle');
          return;
        }
        if (existing.response.status === 404 && !canCreate) {
          setState('absent');
          return;
        }
        if (existing.response.status !== 404) {
          setError(existing.data.error ?? '解读暂时不可用。');
          setState('error');
          return;
        }
        setState('generating');
        for (let tries = 0; tries < 32 && !cancelled; tries += 1) {
          const generated = await request('POST');
          if (cancelled) return;
          if (generated.response.ok && generated.response.status !== 202 && generated.data.overall) {
            setOverall(generated.data.overall);
            setKey(generated.data.key ?? null);
            setState('idle');
            return;
          }
          if (generated.response.status !== 202) {
            throw new Error(generated.data.error ?? 'AI 解读生成失败，请稍后重试。');
          }
          await delay(3000);
        }
        if (!cancelled) throw new Error('AI 解读等待超时，请稍后重试。');
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'AI 解读暂时不可用。');
        setState('error');
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [sessionId, canCreate, attempt]);

  if (state === 'absent') return null;

  return <section className="result-card" aria-live="polite">
    <div className="panel-row">
      <span className="panel-label">AI 整体讯息</span>
      <span className="panel-badge">免登录 · 可分享</span>
    </div>
    {overall ? <>
      <p className="panel-copy">{overall}</p>
      <p className="panel-copy">这是一份反思性提示，不是录取、成绩或未来结果的保证。</p>
      <details className="result-details"><summary>解读缓存</summary>
        <p>相同牌阵、牌位及正逆位会复用解读。Key：{key}</p>
      </details>
    </> : null}
    {state === 'loading' || state === 'generating'
      ? <p className="panel-copy">{state === 'loading' ? '正在查询已有解读…' : '正在连接牌意，生成整体讯息…'}</p>
      : null}
    {state === 'error' ? <>
      <p className="result-error" role="alert">{error}</p>
      <button className="ghost-button" type="button" onClick={() => setAttempt((value) => value + 1)}>重试读取解读</button>
    </> : null}
  </section>;
}
