const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://tarot.example/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true
});
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');

function loadTs(relativePath, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output)(module, module.exports, (id) => {
    if (id in imports) return imports[id];
    if (id === './authCallback' || id === '../reading/authCallback') return loadTs('src/reading/authCallback.ts');
    if (id === './questionRecovery') return loadTs('src/reading/questionRecovery.ts');
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    throw new Error(`Unexpected import: ${id}`);
  });
  return module.exports;
}

let root;
let loginProps;
let authUser = null;
const defaultGetUser = async () => ({ data: { user: authUser } });
let getUser = defaultGetUser;
const emptyComponent = () => null;
const login = { AuthDialog: (props) => {
  loginProps = props;
  return React.createElement('section', { role: 'dialog' }, '邮箱登录');
} };
const { QuestionPage } = loadTs('src/reading/QuestionPage.tsx', {
  '../components/AuraBackdrop': { AuraBackdrop: emptyComponent },
  '../lib/supabase': { getSupabaseClient: async () => ({ auth: {
    getUser: () => getUser(),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  } }) },
  './storage': { createReadingSession() { throw new Error('Unexpected reading creation'); }, saveReadingSession() {} },
  './aiRouting': { recommendSpreadWithAi() { throw new Error('Unexpected AI request'); } },
  './AuthDialog': login
});
const { ResultPage } = loadTs('src/results/ResultPage.tsx', {
  '../components/AuraBackdrop': { AuraBackdrop: emptyComponent },
  './ResultSpread': { ResultSpread: emptyComponent },
  './repository': { isSpreadSessionSaving: () => false },
  './session': { buildShareUrl: (value) => new URL(value, window.location.origin).href },
  '../reading/storage': { findReadingBySpreadResult: () => null },
  '../reading/AuthDialog': login,
  './AnonymousInterpretation': { AnonymousInterpretation: emptyComponent },
  './PrivateInterpretation': { PrivateInterpretation: emptyComponent }
});

const resultProps = {
  session: { id: 'test-result', sharePath: '/spread/test-result', revealedAt: '2026-11-01T00:00:00Z',
    spread: { label: '未来十字' }, quote: '', cards: [], persistence: { cloudBacked: true } },
  loading: false, error: null, source: 'cloud', onReturn() {}, onPrivateDeleted() {}
};
async function render(Component, props = {}) {
  root ??= createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Component, props)); });
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  loginProps = undefined;
  authUser = null;
  getUser = defaultGetUser;
  localStorage.clear();
  sessionStorage.clear();
  dom.reconfigure({ url: 'https://tarot.example/' });
});

test('expired callback shows a retry without exposing or overwriting pending data in a new tab', async () => {
  dom.reconfigure({ url: 'https://tarot.example/#error=access_denied&error_code=otp_expired&error_description=private-detail' });
  const pending = { question: '今年我能顺利完成学业吗？', background: { stage: '硕士' },
    email: 'reader@example.com', createdAt: Date.now() };
  localStorage.setItem('auratarot.question.pending.v1', JSON.stringify(pending));
  await render(QuestionPage, { onStart() {}, onDirectDraw() {} });
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /过期|失效/);
  assert.equal(document.querySelector('#reading-question').value, '');
  assert.doesNotMatch(document.body.textContent, /private-detail/);
  const retry = [...document.querySelectorAll('button')].find((button) => /重新发送登录链接/.test(button.textContent));
  assert.ok(retry, 'the failed callback needs a visible login retry');
  await act(async () => retry.click());
  assert.equal(Boolean(document.querySelector('[role="dialog"]')), false);
  assert.equal(localStorage.getItem('auratarot.question.pending.v1'), JSON.stringify(pending));
});

test('result callback handles query errors and retries back to the same result', async () => {
  dom.reconfigure({ url: 'https://tarot.example/spread/test-result?error=access_denied&error_code=otp_expired' });
  await render(ResultPage, resultProps);
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /过期|失效/);
  const retry = [...document.querySelectorAll('button')].find((button) => /重新发送登录链接/.test(button.textContent));
  assert.ok(retry);
  await act(async () => retry.click());
  assert.equal(loginProps.redirectPath, '/spread/test-result');
  assert.equal(loginProps.intent, 'result');
});

test('failed callback preserves the current draft over another account pending question', async () => {
  dom.reconfigure({ url: 'https://tarot.example/#error=access_denied&error_code=otp_expired' });
  authUser = { id: 'account-b', email: 'b@example.com' };
  const currentDraft = { question: '我的新工作申请能顺利通过吗？', background: { stage: '本科', context: 'B 的背景' } };
  const stalePending = { question: '我能顺利通过这次论文答辩吗？', background: { stage: '硕士', context: 'A 的背景' },
    email: 'a@example.com', createdAt: Date.now() };
  sessionStorage.setItem('auratarot.question.draft.v1', JSON.stringify(currentDraft));
  localStorage.setItem('auratarot.question.pending.v1', JSON.stringify(stalePending));
  await render(QuestionPage, { onStart() {}, onDirectDraw() {} });
  assert.equal(document.querySelector('#reading-question').value, currentDraft.question);
  const saved = JSON.parse(sessionStorage.getItem('auratarot.question.draft.v1'));
  assert.equal(saved.question, currentDraft.question);
  assert.equal(saved.background.context, currentDraft.background.context);
  assert.equal(localStorage.getItem('auratarot.question.pending.v1'), JSON.stringify(stalePending));
});

test('failed callback never restores another account pending question into an empty draft', async () => {
  dom.reconfigure({ url: 'https://tarot.example/#error=access_denied&error_code=otp_expired' });
  authUser = { id: 'account-b', email: 'b@example.com' };
  localStorage.setItem('auratarot.question.pending.v1', JSON.stringify({
    question: '我能顺利通过这次论文答辩吗？', background: { context: 'A 的背景' },
    email: 'a@example.com', createdAt: Date.now()
  }));
  await render(QuestionPage, { onStart() {}, onDirectDraw() {} });
  assert.equal(document.querySelector('#reading-question').value, '');
  assert.equal(JSON.parse(sessionStorage.getItem('auratarot.question.draft.v1')).background.context, '');
});

test('an unresolved auth check neither exposes pending data nor overwrites edits', async () => {
  dom.reconfigure({ url: 'https://tarot.example/#error=access_denied&error_code=otp_expired' });
  let resolveUser;
  getUser = () => new Promise((resolve) => { resolveUser = resolve; });
  localStorage.setItem('auratarot.question.pending.v1', JSON.stringify({
    question: '我能顺利通过这次论文答辩吗？', background: { context: '旧背景' },
    email: 'a@example.com', createdAt: Date.now()
  }));
  await render(QuestionPage, { onStart() {}, onDirectDraw() {} });
  assert.equal(document.querySelector('#reading-question').value, '', 'do not display pending before checking identity');
  const suggestion = document.querySelector('.question-suggestions button');
  await act(async () => suggestion.click());
  await act(async () => resolveUser({ data: { user: null } }));
  assert.equal(document.querySelector('#reading-question').value, suggestion.textContent);
  assert.equal(JSON.parse(sessionStorage.getItem('auratarot.question.draft.v1')).background.context, '');
});

test('callback retry requires a valid question before opening login or creating pending data', async () => {
  dom.reconfigure({ url: 'https://tarot.example/#error=access_denied&error_code=otp_expired' });
  await render(QuestionPage, { onStart() {}, onDirectDraw() {} });
  const retry = [...document.querySelectorAll('button')].find((button) => /重新发送登录链接/.test(button.textContent));
  await act(async () => retry.click());
  assert.equal(Boolean(document.querySelector('[role="dialog"]')), false, 'an empty question must not start login');
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /过期|失效/);
  assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /8–300.*问题/);
  assert.equal(localStorage.getItem('auratarot.question.pending.v1'), null);

  const suggestion = document.querySelector('.question-suggestions button');
  await act(async () => suggestion.click());
  await act(async () => retry.click());
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.equal(loginProps.onEmailSent('reader@example.com'), true);
  assert.equal(JSON.parse(localStorage.getItem('auratarot.question.pending.v1')).question, suggestion.textContent);
});

test('result callback error survives loading and SDK removal of URL error parameters', async () => {
  dom.reconfigure({ url: 'https://tarot.example/spread/test-result#error=access_denied&error_code=otp_expired' });
  await render(ResultPage, { ...resultProps, loading: true, session: null });
  dom.reconfigure({ url: 'https://tarot.example/spread/test-result' });
  await render(ResultPage, resultProps);
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /过期|失效/);
});

test('unrecognized auth failures get a safe message instead of raw provider details', async () => {
  dom.reconfigure({ url: 'https://tarot.example/#error=access_denied&error_code=new_code&error_description=private-detail' });
  await render(QuestionPage, { onStart() {}, onDirectDraw() {} });
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /验证未完成|登录失败/);
  assert.doesNotMatch(document.body.textContent, /private-detail|new_code/);
});

test('successful hash and code callbacks and unrelated URL errors remain untouched', async () => {
  for (const suffix of ['#access_token=test-token&refresh_token=test-refresh&type=magiclink', '?code=test-code', '?error=network']) {
    const url = `https://tarot.example/${suffix}`;
    dom.reconfigure({ url });
    await render(QuestionPage, { onStart() {}, onDirectDraw() {} });
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(window.location.href, url);
    await act(async () => root.unmount());
    root = undefined;
  }
});
