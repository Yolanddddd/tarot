import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { AuraBackdrop } from '../components/AuraBackdrop';
import { getSupabaseClient } from '../lib/supabase';
import { createReadingSession, loadReadingSession, saveReadingSession } from './storage';
import { recommendSpreadWithAi } from './aiRouting';
import type { ReadingBackground, ReadingSession } from './types';
import { AuthDialog } from './AuthDialog';
import { isAuthCallback, readAuthCallbackError } from './authCallback';
import { clearPendingQuestion, matchesPendingIdentity, normalizeBackground, readPendingQuestion,
  readQuestionHandoff, samePending, sameQuestion, savePendingQuestion, saveQuestionHandoff,
  type PendingQuestion } from './questionRecovery';

export const DRAFT_KEY = 'auratarot.question.draft.v1';

function completedReading(pending: PendingQuestion, ownerId: string): ReadingSession | null {
  const handoff = readQuestionHandoff();
  if (!handoff || handoff.ownerId !== ownerId || !samePending(handoff.pending, pending)) return null;
  const reading = loadReadingSession(handoff.readingId);
  return reading?.ownerId === ownerId && sameQuestion(reading, pending) ? reading : null;
}

const suggestions = [
  '我能收到梦校的 offer 吗？',
  '我今年能顺利毕业并取得理想学位吗？',
  '我能拿到心仪的 intern 或 graduate offer 吗？',
  '我适合在今年申请 PhD 吗？',
  '目前阻碍我通过考试的关键因素是？'
];
const emptyBackground: ReadingBackground = { stage: '', region: '', timeframe: '', concern: '', context: '' };

function getDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') as {
    question?: string; background?: ReadingBackground; ownerId?: string;
  }; }
  catch { return {}; }
}

function isValidQuestion(question: string) {
  const length = question.trim().length;
  return length >= 8 && length <= 300;
}

export function QuestionPage({ onStart, onDirectDraw }: {
  onStart: (reading: ReadingSession) => void;
  onDirectDraw: () => void;
}) {
  const [authError, setAuthError] = useState(readAuthCallbackError);
  const [returnedFromAuth] = useState(isAuthCallback);
  const [draft] = useState(getDraft);
  const [draftReady, setDraftReady] = useState(!draft.ownerId);
  const [question, setQuestion] = useState(draft.ownerId ? '' : draft.question ?? '');
  const [background, setBackground] = useState<ReadingBackground>(
    draft.ownerId ? emptyBackground : normalizeBackground(draft.background));
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');
  const pendingInFlight = useRef<PendingQuestion | null>(null);
  const currentUserId = useRef<string | null>(null);
  const identityVersion = useRef(0);
  const connectionAttempt = useRef(0);
  const draftOwnerId = useRef<string | undefined>(undefined);
  const editVersion = useRef(0);
  const lastSavedPending = useRef<{ pending: PendingQuestion; editVersion: number } | null>(null);
  const latest = useRef({ question, background, onStart });
  latest.current = { question, background, onStart };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const beginReading = useCallback(async (nextQuestion: string, nextBackground: ReadingBackground,
    ownerId: string, accessToken: string | null, pending: PendingQuestion | undefined,
    isCurrent: () => boolean) => {
    let reading = pending ? completedReading(pending, ownerId) : null;
    if (!reading) {
      const aiRoute = accessToken ? await recommendSpreadWithAi(nextQuestion, accessToken) : null;
      if (!isCurrent()) return;
      // The other tab may have finished while this tab was waiting for the recommendation.
      reading = pending ? completedReading(pending, ownerId) : null;
      if (!reading) {
        reading = createReadingSession(nextQuestion, nextBackground, ownerId, aiRoute);
        saveReadingSession(reading);
      }
    }
    if (!isCurrent()) return;
    if (pending && loadReadingSession(reading.id)?.ownerId === ownerId &&
      saveQuestionHandoff({ pending, ownerId, readingId: reading.id })) {
      clearPendingQuestion(pending);
    }
    latest.current.onStart(reading);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ question, background, ownerId: draftOwnerId.current })); }
    catch { /* Draft persistence is optional. */ }
  }, [question, background, draftReady]);

  useEffect(() => {
    let active = true;
    let authVersion = 0;
    let unsubscribe: (() => void) | undefined;
    const acceptUser = (nextUser: User | null) => {
      // Update synchronously: a request can finish before React renders this auth event.
      if (currentUserId.current !== (nextUser?.id ?? null)) identityVersion.current++;
      currentUserId.current = nextUser?.id ?? null;
      if (draftOwnerId.current && draftOwnerId.current !== nextUser?.id) {
        draftOwnerId.current = undefined;
        editVersion.current++;
        connectionAttempt.current++;
        pendingInFlight.current = null;
        lastSavedPending.current = null;
        setQuestion('');
        setBackground(emptyBackground);
        setConnecting(false);
        try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage may be unavailable. */ }
      }
      setUser(nextUser);
    };
    void getSupabaseClient().then(async (client) => {
      if (!client || !active) return;
      const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
        authVersion++;
        if (active) acceptUser(session?.user ?? null);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
      const checkedVersion = authVersion;
      const { data, error } = await client.auth.getUser();
      if (error && error.name !== 'AuthSessionMissingError') throw error;
      if (active) {
        if (authVersion === checkedVersion) acceptUser(data.user);
        setAuthChecked(true);
      }
    }).catch(() => {
      // An unavailable identity check must not discard a saved, owner-scoped draft.
      if (active) setMessage('登录状态暂时未能确认，你的输入已保留，请稍后再试。');
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (draftReady || !authChecked) return;
    if (user && draft.ownerId === user.id && editVersion.current === 0) {
      draftOwnerId.current = user.id;
      setQuestion(draft.question ?? '');
      setBackground(normalizeBackground(draft.background));
    }
    setDraftReady(true);
  }, [authChecked, user, draft, draftReady]);

  useEffect(() => {
    if (!authChecked || !user || !draftReady) return;
    let pending = readPendingQuestion();
    if (!pending && returnedFromAuth) {
      const handoff = readQuestionHandoff();
      if (handoff?.ownerId === user.id && completedReading(handoff.pending, user.id)) pending = handoff.pending;
    }
    if (!pending || !matchesPendingIdentity(pending, user)) return;
    const current = latest.current;
    const saved = lastSavedPending.current;
    if (editVersion.current !== 0 && (!saved || !samePending(saved.pending, pending) ||
      saved.editVersion !== editVersion.current)) return;
    const hasDraft = Boolean(current.question.trim() || Object.values(current.background).some(Boolean));
    if (hasDraft && !sameQuestion(current, pending)) return;
    if (pendingInFlight.current && samePending(pendingInFlight.current, pending)) return;
    const restoredBackground = normalizeBackground(pending.background);
    draftOwnerId.current = user.id;
    setQuestion(pending.question);
    setBackground(restoredBackground);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      question: pending.question, background: restoredBackground, ownerId: user.id
    })); }
    catch { /* The visible draft is still available if storage is full. */ }
    // Reopening a used link may report an error even when this account is already signed in.
    if (authError) return;
    pendingInFlight.current = pending;
    const expected = pending;
    const version = editVersion.current;
    const attempt = ++connectionAttempt.current;
    const isCurrent = () => mounted.current && editVersion.current === version &&
      connectionAttempt.current === attempt && currentUserId.current === user.id;
    setConnecting(true);
    void getSupabaseClient().then((client) => client?.auth.getSession()).then((session) => {
      if (!isCurrent()) return;
      return beginReading(expected.question, restoredBackground, user.id,
        session?.data.session?.user.id === user.id ? session.data.session.access_token : null, expected, isCurrent);
    }).catch(() => { if (isCurrent()) setMessage('连接未完成，你的问题已恢复，请再试一次。'); }).finally(() => {
      if (pendingInFlight.current === expected) {
        pendingInFlight.current = null;
        if (mounted.current && connectionAttempt.current === attempt) setConnecting(false);
      }
    });
  }, [authChecked, user, beginReading, returnedFromAuth, authError, draftReady]);

  function markEdited() {
    editVersion.current++;
    // New input intentionally replaces a draft still waiting for its owner's identity check.
    setDraftReady(true);
  }

  function updateBackground(key: keyof ReadingBackground, value: string) {
    markEdited();
    setBackground((current) => ({ ...current, [key]: value }));
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    const clean = question.trim();
    if (!isValidQuestion(clean)) { setMessage('请用 8–300 个字描述一个明确的问题。'); return; }
    if (connecting) return;
    const version = editVersion.current;
    const authVersion = identityVersion.current;
    const attempt = ++connectionAttempt.current;
    const isUnchanged = () => mounted.current && editVersion.current === version &&
      identityVersion.current === authVersion && connectionAttempt.current === attempt;
    setMessage('');
    setConnecting(true);
    try {
      const client = await getSupabaseClient();
      const [auth] = await Promise.all([
        client?.auth.getUser(),
        new Promise((resolve) => window.setTimeout(resolve, 300))
      ]);
      if (!isUnchanged()) return;
      if (auth?.error && auth.error.name !== 'AuthSessionMissingError') throw auth.error;
      const signedInUser: User | null = auth?.data.user ?? null;
      if (!signedInUser) { setShowLogin(true); return; }
      const isCurrent = () => isUnchanged() &&
        (!currentUserId.current || currentUserId.current === signedInUser.id);
      if (!isCurrent()) return;
      draftOwnerId.current = signedInUser.id;
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ question: clean, background, ownerId: signedInUser.id })); }
      catch { /* The visible draft is still available if storage is full. */ }
      const { data: sessionData } = await client!.auth.getSession();
      if (!isCurrent()) return;
      const stored = readPendingQuestion();
      const handoff = returnedFromAuth ? readQuestionHandoff() : null;
      const candidate = stored ?? (handoff?.ownerId === signedInUser.id ? handoff.pending : null);
      const pending = candidate && matchesPendingIdentity(candidate, signedInUser) &&
        sameQuestion(candidate, { question: clean, background }) ? candidate : undefined;
      await beginReading(clean, background, signedInUser.id,
        sessionData.session?.user.id === signedInUser.id ? sessionData.session.access_token : null, pending, isCurrent);
    } catch {
      if (isUnchanged()) setMessage('连接未完成，请再试一次。');
    } finally {
      if (mounted.current && connectionAttempt.current === attempt) setConnecting(false);
    }
  }

  function savePending(identity: { email?: string; phone?: string }) {
    const pending = { question: question.trim(), background, ...identity, createdAt: Date.now() } satisfies PendingQuestion;
    if (!savePendingQuestion(pending)) return false;
    lastSavedPending.current = { pending, editVersion: editVersion.current };
    return true;
  }

  return <main className="question-page">
    <AuraBackdrop />
    <header className="question-header"><span className="question-brand">∞ <span>AURATAROT</span></span><span>留学问途 · 提问</span></header>
    <section className="question-panel" aria-labelledby="question-title">
      <p className="eyebrow">A QUESTION FOR THE CARDS</p>
      <h1 id="question-title">此刻，你心中的迷雾是什么？</h1>
      <p className="question-intro">从一个真实的困惑开始。我们会为它推荐牌阵，陪你看见更多可能。</p>
      {authError ? <div>
        <p className="question-message" role="alert">{authError}</p>
        <button type="button" className="ghost-button" onClick={() => {
          if (!isValidQuestion(question)) {
            setMessage('请先用 8–300 个字描述一个明确的问题，再重新发送登录链接。');
            return;
          }
          setMessage(''); setAuthError(null); setShowLogin(true);
        }}>重新发送登录链接</button>
      </div> : null}
      <form onSubmit={start}>
        <label className="question-label" htmlFor="reading-question">你的问题</label>
        <textarea id="reading-question" value={question} onChange={(event) => { markEdited(); setQuestion(event.target.value); setMessage(''); }}
          minLength={8} maxLength={300} rows={4} required
          placeholder="请在心中默念你的问题，并写下它（如：我今年能顺利毕业吗？）" />
        <div className="question-meta"><span>一次聚焦一个问题，给自己一个明确的时间范围</span><span>{question.length}/300</span></div>
        <div className="question-suggestions"><p>从这些问题开始</p><div>
          {suggestions.map((item) => <button type="button" key={item} onClick={() => { markEdited(); setQuestion(item); }}>{item}</button>)}
        </div></div>
        <section className="question-spreads" aria-label="三种牌阵介绍">
          <p>你的问题会连接到合适的牌阵</p>
          <div className="question-spreads__grid">
            <article><span>01 · 5 张</span><h2>未来十字</h2><p>适合一个明确目标。梳理现状、阻碍与近期趋势，预见事情的“最终走向”并提供“下一步建议”。</p></article>
            <article><span>02 · 7 张</span><h2>六芒星</h2><p>适合复杂选择或多方因素。看见过去、现在、未来，洞察环境与潜意识的影响，为你理清局势并寻找“破局点”。</p></article>
            <article><span>03 · 9 张</span><h2>月度运势</h2><p>适合关注“未来一个月”。从学业与事业、人际与感情、自我状态三个维度展开。</p></article>
          </div>
        </section>
        <details className="question-background"><summary>告诉我们更多，让塔罗更了解你，解读更贴近你 <span>选填 · 私有云端保存</span></summary>
          <div className="question-fields">
            <label>当前阶段<select value={background.stage} onChange={(event) => updateBackground('stage', event.target.value)}>
              <option value="">暂不提供</option><option>预科</option><option>本科</option><option>硕士</option><option>PhD</option><option>求职</option>
            </select></label>
            <label>所在地区<input value={background.region} maxLength={60} onChange={(event) => updateBackground('region', event.target.value)} placeholder="例如：英国（可跳过）" /></label>
            <label>关注时间<input value={background.timeframe} maxLength={60} onChange={(event) => updateBackground('timeframe', event.target.value)} placeholder="例如：今年、下个月" /></label>
            <label>主要顾虑<input value={background.concern} maxLength={160} onChange={(event) => updateBackground('concern', event.target.value)} placeholder="例如：论文成绩或面试" /></label>
            <label className="question-fields__wide">补充背景<textarea value={background.context} maxLength={400} rows={2} onChange={(event) => updateBackground('context', event.target.value)} placeholder="只写你愿意提供的信息，无需提供姓名或成绩单" /></label>
          </div>
        </details>
        <button className="question-primary" type="submit" disabled={connecting}>
          {connecting ? '正在连接…' : '开始连接'} <span aria-hidden="true">✦</span>
        </button>
      </form>
      {showLogin ? <AuthDialog onClose={() => setShowLogin(false)}
        onEmailSent={(email) => savePending({ email })}
        onPhoneSent={(phone) => savePending({ phone })} /> : null}
      {message ? <p className="question-message" role="status">{message}</p> : null}
      <div className="question-direct"><span>还没有想好问题？</span><button type="button" onClick={() => {
        connectionAttempt.current++;
        if (lastSavedPending.current) clearPendingQuestion(lastSavedPending.current.pending);
        onDirectDraw();
      }}>直接抽牌，无需登录 →</button></div>
    </section>
    <p className="question-footer">登录后会将问题发送给 DeepSeek 推荐牌阵；服务暂不可用时改用本地规则。抽牌后，你的问题及自愿填写的背景会经服务端发送给 DeepSeek 生成私有解读，并保存在私有云端表；不会进入公开分享链接。塔罗不保证录取、学位或 offer。</p>
  </main>;
}
