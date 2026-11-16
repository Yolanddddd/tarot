import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

type AuthMethod = 'email' | 'phone';

const EMAIL_RETRY_KEY = 'auratarot.auth.emailRetryAt.v1';
const EMAIL_RETRY_MS = 60_000;

function readEmailRetryAt() {
  try {
    const value = Number(sessionStorage.getItem(EMAIL_RETRY_KEY));
    return Number.isFinite(value) && value > Date.now()
      ? Math.min(value, Date.now() + EMAIL_RETRY_MS) : 0;
  } catch { return 0; }
}

function isEmailRateLimit(error: { code?: string; message: string; status?: number }) {
  return error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit'
    || error.status === 429 || /rate limit|excess limit/i.test(error.message);
}

function emailSendErrorMessage(error: { code?: string; message: string; status?: number }) {
  if (error.code === 'email_address_not_authorized' || /email address not authorized/i.test(error.message)) {
    return '邮箱登录服务暂未开放，请联系网站管理员完成邮件服务配置。';
  }
  if (error.code === 'email_provider_disabled' || error.code === 'otp_disabled' || error.code === 'signup_disabled') {
    return '邮箱登录或注册暂未开放，请联系网站管理员。';
  }
  if (error.code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(error.message)) {
    return '登录邮件发送额度已达上限。请先查看收件箱和垃圾邮件；若未收到，请稍后再试或联系网站管理员。重试倒计时结束不代表邮件额度已恢复。';
  }
  if (isEmailRateLimit(error)) {
    return '请求太频繁，请等待几分钟后再试，不要连续点击发送。';
  }
  return `发送失败：${error.message}`;
}

interface Props {
  onClose: () => void;
  onEmailSent: (email: string) => boolean;
  onPhoneSent: (phone: string) => boolean;
  redirectPath?: string;
  intent?: 'question' | 'result';
}

export function AuthDialog({ onClose, onEmailSent, onPhoneSent,
  redirectPath = '/', intent = 'question' }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [method, setMethod] = useState<AuthMethod>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const emailSending = useRef(false);
  const [emailRetryAt, setEmailRetryAt] = useState(readEmailRetryAt);
  const [emailRetrySeconds, setEmailRetrySeconds] = useState(() =>
    Math.max(0, Math.ceil((emailRetryAt - Date.now()) / 1000)));
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  useEffect(() => {
    const remaining = Math.max(0, Math.ceil((emailRetryAt - Date.now()) / 1000));
    setEmailRetrySeconds(remaining);
    if (remaining === 0) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((emailRetryAt - Date.now()) / 1000));
      setEmailRetrySeconds(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [emailRetryAt]);

  function startEmailCooldown() {
    const retryAt = Date.now() + EMAIL_RETRY_MS;
    try { sessionStorage.setItem(EMAIL_RETRY_KEY, String(retryAt)); }
    catch { /* In-memory cooldown still works when browser storage is unavailable. */ }
    setEmailRetryAt(retryAt);
    setEmailRetrySeconds(60);
  }

  async function sendEmail(event: FormEvent) {
    event.preventDefault();
    if (emailSending.current || busy || emailRetrySeconds > 0) return;
    emailSending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const client = await getSupabaseClient();
      if (!client) { setMessage('登录服务尚未配置。'); return; }
      const normalized = email.trim().toLowerCase();
      const { error } = await client.auth.signInWithOtp({ email: normalized, options: {
        emailRedirectTo: new URL(redirectPath, window.location.origin).toString()
      } });
      if (error) {
        setMessage(emailSendErrorMessage(error));
        if (isEmailRateLimit(error)) startEmailCooldown();
        return;
      }
      startEmailCooldown();
      const saved = onEmailSent(normalized);
      setMessage(saved
        ? intent === 'result'
          ? '登录链接已发送。请在同一浏览器打开邮件；验证后会返回这次结果。'
          : '登录链接已发送。请在同一浏览器打开邮件；验证后会直接进入推荐牌阵。'
        : '登录链接已发送，但浏览器未保存问题。验证后请返回提问页，再点击“开始连接”。');
    } catch {
      setMessage('邮件发送失败，请检查网络连接后重试。');
    } finally {
      emailSending.current = false;
      setBusy(false);
    }
  }

  async function sendPhoneCode(event: FormEvent) {
    event.preventDefault();
    const normalized = phone.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setMessage('请输入带国际区号的手机号，例如 +447123456789。');
      return;
    }
    const client = await getSupabaseClient();
    if (!client) { setMessage('登录服务尚未配置。'); return; }
    setBusy(true);
    setMessage('');
    const { error } = await client.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (error) { setMessage(`短信发送失败：${error.message}`); return; }
    setPhone(normalized);
    setPhoneCodeSent(true);
    const saved = onPhoneSent(normalized);
    setMessage(saved ? '验证码已发送，请查看手机短信。' : '验证码已发送，但浏览器未保存问题。验证后请重新提交问题。');
  }

  async function verifyPhoneCode(event: FormEvent) {
    event.preventDefault();
    const client = await getSupabaseClient();
    if (!client) { setMessage('登录服务尚未配置。'); return; }
    setBusy(true);
    setMessage('');
    const { error } = await client.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
    setBusy(false);
    if (error) { setMessage(`验证失败：${error.message}`); return; }
    setMessage(intent === 'result' ? '验证成功，正在读取私人解读…' : '验证成功，正在进入推荐牌阵…');
  }

  return <dialog className="auth-dialog" ref={dialog} onClose={onClose} aria-labelledby="auth-dialog-title">
    <div className="auth-dialog__header">
      <span className="eyebrow">AURATAROT / SIGN IN</span>
      <button type="button" className="auth-dialog__close" aria-label="关闭登录弹窗" onClick={() => dialog.current?.close()}>×</button>
    </div>
    <h2 id="auth-dialog-title">登录后，继续连接</h2>
    <p className="auth-dialog__intro">{intent === 'result' ? '验证后返回这次结果，仅本人可查看自己的私人解读。' : '验证成功后会直接进入为你的问题推荐的牌阵。'}首次验证也会自动注册账号。</p>
    <div className="auth-dialog__methods" role="tablist" aria-label="选择登录方式">
      <button type="button" role="tab" aria-selected={method === 'email'} onClick={() => { setMethod('email'); setMessage(''); }}>邮箱</button>
      <button type="button" role="tab" aria-selected={method === 'phone'} onClick={() => { setMethod('phone'); setMessage(''); }}>手机号</button>
    </div>
    {method === 'email' ? <form className="auth-dialog__form" onSubmit={sendEmail}>
      <label htmlFor="auth-email">邮箱地址</label>
      <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="yourname@example.com" />
      <button type="submit" disabled={busy || !configured || emailRetrySeconds > 0}>{busy ? '发送中…' : emailRetrySeconds > 0 ? `${emailRetrySeconds} 秒后可重试` : '发送登录链接'}</button>
      <p className="auth-dialog__hint">邮箱目前使用一次性登录链接，打开邮件即可完成验证。</p>
    </form> : <form className="auth-dialog__form" onSubmit={phoneCodeSent ? verifyPhoneCode : sendPhoneCode}>
      <label htmlFor="auth-phone">手机号（含国际区号）</label>
      <input id="auth-phone" type="tel" autoComplete="tel" required value={phone} onChange={(event) => {
        setPhone(event.target.value); setPhoneCodeSent(false); setCode('');
      }} placeholder="+447123456789" />
      {phoneCodeSent ? <><label htmlFor="auth-code">短信验证码</label>
        <input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入短信中的验证码" /></> : null}
      <button type="submit" disabled={busy || !configured}>{busy ? '请稍候…' : phoneCodeSent ? '验证并继续' : '发送短信验证码'}</button>
      <p className="auth-dialog__hint">手机号登录需在 Supabase 开启 Phone，并配置短信供应商。</p>
    </form>}
    {!configured ? <p className="auth-dialog__status" role="status">登录服务尚未配置；目前可关闭弹窗并直接抽牌。</p> : null}
    {message ? <p className="auth-dialog__status" role="status">{message}</p> : null}
  </dialog>;
}
