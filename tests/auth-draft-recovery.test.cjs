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

const ROOT = path.join(__dirname, '..');
const DRAFT_KEY = 'auratarot.question.draft.v1';
const PENDING_KEY = 'auratarot.question.pending.v1';
const reader = { id: 'reader-a', email: 'reader@example.com' };
const background = { stage: '硕士', region: '英国', timeframe: '今年', concern: '论文答辩', context: '还有两个月准备论文答辩。' };
const originalQuestion = '今年我能顺利完成论文答辩吗？';

let root;
let secondRoot;
let authUser = null;
let listener;
let starts = [];
const defaultGetUser = async () => ({ data: { user: authUser } });
const defaultGetSession = async () => ({ data: { session: authUser ? { user: authUser, access_token: 'test-access-token' } : null } });
let getUser = defaultGetUser;
let getSession = defaultGetSession;
let recommend = async () => null;
const authClient = { auth: {
  getUser: () => getUser(),
  getSession: () => getSession(),
  onAuthStateChange: (callback) => {
    listener = callback;
    return { data: { subscription: { unsubscribe() { listener = undefined; } } } };
  }
} };

const overrides = {
  'src/components/AuraBackdrop': { AuraBackdrop: () => null },
  'src/lib/supabase': { getSupabaseClient: async () => authClient },
  'src/reading/aiRouting': { recommendSpreadWithAi: (...args) => recommend(...args) },
  'src/reading/AuthDialog': { AuthDialog: () => React.createElement('section', { role: 'dialog' }, '邮箱登录') }
};
const cache = new Map();
function loadTs(relativePath) {
  const file = path.resolve(ROOT, relativePath);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  new Function('module', 'exports', 'require', output)(module, module.exports, (id) => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    if (!id.startsWith('.')) throw new Error(`Unexpected import: ${id}`);
    const base = path.resolve(path.dirname(file), id);
    const key = path.relative(ROOT, base).replaceAll('\\', '/');
    if (key in overrides) return overrides[key];
    if (base.endsWith('.json')) return JSON.parse(fs.readFileSync(base, 'utf8'));
    return loadTs(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx');
  });
  return module.exports;
}
const { QuestionPage } = loadTs('src/reading/QuestionPage.tsx');
const onStart = (reading) => { starts.push(reading); };

function seedPending() {
  const pending = { question: originalQuestion, background, email: reader.email, createdAt: Date.now() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  return pending;
}

async function render() {
  root ??= createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(QuestionPage, { onStart, onDirectDraw() {} }));
  });
}

async function unmount() {
  if (root) await act(async () => root.unmount());
  root = undefined;
}

function currentQuestion() {
  return document.querySelector('#reading-question')?.value;
}

function displayedBackground() {
  const fields = document.querySelector('.question-fields');
  return {
    stage: fields.querySelector('select').value,
    region: fields.querySelectorAll('input')[0].value,
    timeframe: fields.querySelectorAll('input')[1].value,
    concern: fields.querySelectorAll('input')[2].value,
    context: fields.querySelector('textarea').value
  };
}

afterEach(async () => {
  await unmount();
  if (secondRoot) await act(async () => secondRoot.unmount());
  secondRoot = undefined;
  document.getElementById('second-root')?.remove();
  authUser = null;
  listener = undefined;
  starts = [];
  getUser = defaultGetUser;
  getSession = defaultGetSession;
  recommend = async () => null;
  localStorage.clear();
  sessionStorage.clear();
  dom.reconfigure({ url: 'https://tarot.example/' });
});

test('a successful email callback retains the submitted question and background when continuation fails', async () => {
  seedPending();
  authUser = reader;
  getSession = async () => { throw new Error('temporary session lookup failure'); };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });

  await render();

  assert.equal(currentQuestion(), originalQuestion, 'the authenticated callback must recover the question before attempting continuation');
  assert.deepEqual(displayedBackground(), background);
  const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
  assert.equal(draft.question, originalQuestion, 'a refresh after a transient error must also retain the question');
  assert.deepEqual(draft.background, background);
  assert.equal(starts.length, 0);
  assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /未完成|重试|再试/);

  await unmount();
  await render();
  assert.equal(currentQuestion(), originalQuestion);
  assert.deepEqual(displayedBackground(), background);
});

test('the email callback tab retains the input after another tab resumes, even when the SDK clears the callback hash', async () => {
  const pending = seedPending();
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ question: pending.question, background: pending.background }));
  await render();
  assert.equal(starts.length, 0);

  authUser = reader;
  await act(async () => listener('SIGNED_IN', { user: reader, access_token: 'test-access-token' }));
  assert.equal(starts.length, 1, 'the original tab first receives the shared authentication event');
  assert.equal(starts[0].question, originalQuestion);
  await unmount();

  // A link opened from an email has a new sessionStorage but shares localStorage.
  // Keep all effects of the real first mount, including pending consumption.
  sessionStorage.clear();
  starts = [];
  let resolveUser;
  getUser = () => new Promise((resolve) => { resolveUser = resolve; });
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();
  assert.equal(currentQuestion(), '', 'wait for verified identity before revealing a private draft');
  dom.reconfigure({ url: 'https://tarot.example/' });
  await act(async () => resolveUser({ data: { user: reader } }));

  const resumed = starts.at(-1);
  assert.equal(resumed?.question ?? currentQuestion(), originalQuestion,
    'the callback must continue or refill the original question even if another tab completed first');
  assert.deepEqual(resumed?.background ?? displayedBackground(), background);
});

test('a callback for a different account does not reveal the pending question or background', async () => {
  seedPending();
  authUser = { id: 'reader-b', email: 'other@example.com' };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=other-test-token&refresh_token=other-test-refresh&type=magiclink' });

  await render();

  assert.equal(currentQuestion(), '');
  assert.equal(displayedBackground().context, '');
  assert.equal(starts.length, 0);
  assert.doesNotMatch(document.body.textContent, /还有两个月准备论文答辩/);
});

test('a later callback for another account cannot recover the first account completed reading', async () => {
  seedPending();
  authUser = reader;
  await render();
  assert.equal(starts.length, 1);
  await unmount();

  sessionStorage.clear();
  starts = [];
  authUser = { id: 'reader-b', email: 'other@example.com' };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=other-test-token&refresh_token=other-test-refresh&type=magiclink' });
  await render();

  assert.equal(starts.length, 0);
  assert.equal(currentQuestion(), '');
  assert.equal(displayedBackground().context, '');
});

test('edits made while authentication is being checked are not replaced or auto-submitted as an older pending question', async () => {
  seedPending();
  let resolveUser;
  getUser = () => new Promise((resolve) => { resolveUser = resolve; });
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();

  const suggestion = document.querySelectorAll('.question-suggestions button')[2];
  await act(async () => suggestion.click());
  const editedQuestion = suggestion.textContent;
  authUser = reader;
  await act(async () => resolveUser({ data: { user: reader } }));

  assert.equal(currentQuestion(), editedQuestion);
  assert.equal(JSON.parse(sessionStorage.getItem(DRAFT_KEY)).question, editedQuestion);
  assert.equal(displayedBackground().context, '');
  assert.equal(starts.length, 0, 'a late identity check must not submit the stale pending question over newer edits');
});

test('returning to the normal homepage does not automatically restart an already resumed question', async () => {
  seedPending();
  authUser = reader;
  await render();
  assert.equal(starts.length, 1);
  await unmount();

  sessionStorage.clear();
  starts = [];
  dom.reconfigure({ url: 'https://tarot.example/' });
  await render();

  assert.equal(starts.length, 0, 'a completed login continuation must not hijack ordinary visits');
  assert.equal(currentQuestion(), '');
});

test('editing the question while the recommendation is pending cancels the old automatic continuation', async () => {
  seedPending();
  authUser = reader;
  let resolveRecommendation;
  recommend = () => new Promise((resolve) => { resolveRecommendation = resolve; });
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();
  assert.equal(typeof resolveRecommendation, 'function', 'the real continuation must be awaiting the recommendation');

  const suggestion = document.querySelectorAll('.question-suggestions button')[2];
  await act(async () => suggestion.click());
  const editedQuestion = suggestion.textContent;
  await act(async () => resolveRecommendation(null));

  assert.equal(starts.length, 0, 'a recommendation for the previous question must not navigate away from current edits');
  assert.equal(currentQuestion(), editedQuestion);
  assert.equal(JSON.parse(sessionStorage.getItem(DRAFT_KEY)).question, editedQuestion);
});

test('finishing an earlier request does not delete a newer pending question for the same email', async () => {
  const first = seedPending();
  authUser = reader;
  let resolveRecommendation;
  recommend = () => new Promise((resolve) => { resolveRecommendation = resolve; });
  await render();
  assert.equal(typeof resolveRecommendation, 'function');

  // Another tab requests a new login link while the first continuation is still running.
  const newer = { ...first, question: '我能顺利找到适合自己的工作吗？',
    background: { ...background, concern: '求职', context: '新的职业规划。' }, createdAt: first.createdAt + 1 };
  localStorage.setItem(PENDING_KEY, JSON.stringify(newer));
  await act(async () => resolveRecommendation(null));

  assert.deepEqual(JSON.parse(localStorage.getItem(PENDING_KEY)), newer,
    'completing one login must only consume its own pending request');
});

test('a verified callback after thirty-one minutes still recovers the pending question', async () => {
  const pending = seedPending();
  localStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, createdAt: Date.now() - 31 * 60 * 1000 }));
  authUser = reader;
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });

  await render();

  assert.equal(starts.at(-1)?.question ?? currentQuestion(), originalQuestion,
    'a still-usable email link should not lose the draft after the old thirty-minute cutoff');
  assert.deepEqual(starts.at(-1)?.background ?? displayedBackground(), background);
});

test('a completed handoff older than twenty-four hours is not recovered', async (t) => {
  const createdAt = Date.now();
  seedPending();
  authUser = reader;
  await render();
  assert.equal(starts.length, 1);
  await unmount();

  sessionStorage.clear();
  starts = [];
  t.mock.method(Date, 'now', () => createdAt + 24 * 60 * 60 * 1000 + 60 * 1000);
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();

  assert.equal(starts.length, 0);
  assert.equal(currentQuestion(), '');
  assert.equal(displayedBackground().context, '');
});

test('an already signed-in reader reopening an expired email recovers the draft without hiding the error or navigating', async () => {
  seedPending();
  authUser = reader;
  await render();
  assert.equal(starts.length, 1);
  await unmount();

  sessionStorage.clear();
  starts = [];
  dom.reconfigure({ url: 'https://tarot.example/#error=access_denied&error_code=otp_expired&error_description=private-detail' });
  await render();

  assert.equal(currentQuestion(), originalQuestion);
  assert.deepEqual(displayedBackground(), background);
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /过期|失效/);
  assert.doesNotMatch(document.body.textContent, /private-detail/);
  assert.equal(starts.length, 0, 'a failed callback must remain visible for the reader to choose the next action');
});

test('two pending continuations finishing in order reuse the same completed reading', async () => {
  seedPending();
  authUser = reader;
  const recommendations = [];
  recommend = () => new Promise((resolve) => recommendations.push(resolve));
  const firstStarts = [];
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(QuestionPage, {
    onStart: (reading) => firstStarts.push(reading), onDirectDraw() {}
  })));
  assert.equal(recommendations.length, 1);

  // Separate mounts model both tabs having already captured the same pending question.
  // Only localStorage supplies the handoff; the second mount starts without a session draft.
  sessionStorage.clear();
  const secondContainer = document.createElement('div');
  secondContainer.id = 'second-root';
  document.body.append(secondContainer);
  const secondStarts = [];
  secondRoot = createRoot(secondContainer);
  await act(async () => secondRoot.render(React.createElement(QuestionPage, {
    onStart: (reading) => secondStarts.push(reading), onDirectDraw() {}
  })));
  assert.equal(recommendations.length, 2);

  await act(async () => recommendations[0](null));
  await act(async () => recommendations[1](null));

  assert.equal(firstStarts.length, 1);
  assert.equal(secondStarts.length, 1);
  assert.equal(firstStarts[0].id, secondStarts[0].id,
    'the later completion should reuse the reading that the first tab already saved');
  assert.equal(firstStarts[0].question, originalQuestion);
  assert.deepEqual(secondStarts[0].background, background);
});

test('signing out after recovery clears the private draft before another account signs in', async () => {
  seedPending();
  authUser = reader;
  getSession = async () => { throw new Error('temporary session lookup failure'); };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();
  assert.equal(currentQuestion(), originalQuestion);
  assert.deepEqual(displayedBackground(), background);

  authUser = null;
  await act(async () => listener('SIGNED_OUT', null));
  assert.equal(currentQuestion(), '', 'sign-out must stop displaying the authenticated recovery immediately');
  assert.equal(displayedBackground().context, '');
  const signedOutDraft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}');
  assert.equal(signedOutDraft.question ?? '', '');
  assert.equal(signedOutDraft.background?.context ?? '', '');

  authUser = { id: 'reader-b', email: 'other@example.com' };
  await act(async () => listener('SIGNED_IN', { user: authUser, access_token: 'other-test-token' }));
  assert.equal(currentQuestion(), '');
  assert.equal(displayedBackground().context, '');
  assert.equal(starts.length, 0);
});

test('a recovered session draft is not exposed while a later callback verifies a different account', async () => {
  seedPending();
  authUser = reader;
  getSession = async () => { throw new Error('temporary session lookup failure'); };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();
  assert.equal(currentQuestion(), originalQuestion);
  assert.equal(JSON.parse(sessionStorage.getItem(DRAFT_KEY)).question, originalQuestion);
  await unmount();

  // Keep the actual session draft that the first authenticated mount wrote.
  let resolveUser;
  getUser = () => new Promise((resolve) => { resolveUser = resolve; });
  authUser = { id: 'reader-b', email: 'other@example.com' };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=other-test-token&refresh_token=other-test-refresh&type=magiclink' });
  await render();
  assert.equal(currentQuestion(), '', 'a saved private draft must remain hidden until its owner is verified');
  assert.equal(displayedBackground().context, '');

  await act(async () => resolveUser({ data: { user: authUser } }));
  assert.equal(currentQuestion(), '');
  assert.equal(displayedBackground().context, '');
  assert.equal(starts.length, 0);
  const nextDraft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}');
  assert.equal(nextDraft.question ?? '', '');
  assert.equal(nextDraft.background?.context ?? '', '');
});

test('an account switch and recommendation completion in the same event batch cannot open the previous account reading', async () => {
  seedPending();
  authUser = reader;
  let resolveRecommendation;
  recommend = () => new Promise((resolve) => { resolveRecommendation = resolve; });
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();
  assert.equal(typeof resolveRecommendation, 'function');

  authUser = { id: 'reader-b', email: 'other@example.com' };
  await act(async () => {
    listener('SIGNED_IN', { user: authUser, access_token: 'other-test-token' });
    resolveRecommendation(null);
  });

  assert.equal(starts.length, 0, 'identity checks must notice auth events before the next React render');
  assert.equal(currentQuestion(), '');
  assert.equal(displayedBackground().context, '');
});

for (const failedKey of ['auratarot.private.readings.v1', 'auratarot.question.handoff.v1']) {
  test(`a failed ${failedKey} write preserves the pending question for a later callback`, async (t) => {
    const pending = seedPending();
    authUser = reader;
    const originalSetItem = dom.window.Storage.prototype.setItem;
    let blockedWrites = 0;
    t.mock.method(dom.window.Storage.prototype, 'setItem', function (key, value) {
      if (this === localStorage && key === failedKey) {
        blockedWrites++;
        throw new dom.window.DOMException('Simulated storage quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });
    dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });

    await render();

    assert.ok(blockedWrites > 0, 'the test must exercise the intended storage failure');
    assert.deepEqual(JSON.parse(localStorage.getItem(PENDING_KEY)), pending,
      'pending may only be consumed after the reading and recovery handoff have both been saved');
    assert.equal(currentQuestion(), originalQuestion);
    assert.deepEqual(displayedBackground(), background);
  });
}

async function beginManualRetryAfterRecoveryFailure() {
  seedPending();
  authUser = reader;
  getSession = async () => { throw new Error('temporary session lookup failure'); };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();
  assert.equal(starts.length, 0);
  assert.equal(currentQuestion(), originalQuestion);
  assert.deepEqual(displayedBackground(), background);

  getSession = defaultGetSession;
  let resolveRecommendation;
  recommend = () => new Promise((resolve) => { resolveRecommendation = resolve; });
  await act(async () => {
    document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 330));
  });
  assert.equal(typeof resolveRecommendation, 'function', 'the manual retry must reach its recommendation request');
  return resolveRecommendation;
}

test('editing during a manual retry cancels the recovered question continuation', async () => {
  const resolveRecommendation = await beginManualRetryAfterRecoveryFailure();
  const suggestion = document.querySelectorAll('.question-suggestions button')[2];
  await act(async () => suggestion.click());
  const editedQuestion = suggestion.textContent;
  await act(async () => resolveRecommendation(null));

  assert.equal(starts.length, 0, 'the manual retry must not navigate away after the reader changes their question');
  assert.equal(currentQuestion(), editedQuestion);
  assert.equal(JSON.parse(sessionStorage.getItem(DRAFT_KEY)).question, editedQuestion);
});

test('switching accounts during a manual retry cannot open the previous account reading', async () => {
  const resolveRecommendation = await beginManualRetryAfterRecoveryFailure();
  authUser = { id: 'reader-b', email: 'other@example.com' };
  await act(async () => {
    listener('SIGNED_IN', { user: authUser, access_token: 'other-test-token' });
    resolveRecommendation(null);
  });

  assert.equal(starts.length, 0, 'the manual retry must recheck identity before opening a reading');
  assert.equal(currentQuestion(), '');
  assert.equal(displayedBackground().context, '');
});

test('a successful manual retry is reused when the email callback opens another tab', async () => {
  const resolveRecommendation = await beginManualRetryAfterRecoveryFailure();
  await act(async () => resolveRecommendation(null));
  assert.equal(starts.length, 1);
  const manualReading = starts[0];
  assert.equal(manualReading.question, originalQuestion);
  assert.deepEqual(manualReading.background, background);
  await unmount();

  sessionStorage.clear();
  starts = [];
  recommend = async () => null;
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();

  assert.equal(starts.length, 1, 'the callback should continue the reading that manual retry already created');
  assert.equal(starts[0].id, manualReading.id, 'retrying should publish the same recovery handoff as automatic continuation');
  assert.equal(starts[0].question, originalQuestion);
  assert.deepEqual(starts[0].background, background);
});

test('a temporary identity lookup failure preserves an existing owner-scoped session draft', async () => {
  seedPending();
  authUser = reader;
  getSession = async () => { throw new Error('temporary session lookup failure'); };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();
  assert.equal(currentQuestion(), originalQuestion);
  const recoveredDraft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
  assert.equal(recoveredDraft.question, originalQuestion);
  assert.deepEqual(recoveredDraft.background, background);
  await unmount();

  getUser = async () => { throw new Error('temporary identity lookup failure'); };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();

  assert.equal(currentQuestion(), '', 'private input must wait for a verified owner');
  assert.deepEqual(JSON.parse(sessionStorage.getItem(DRAFT_KEY)), recoveredDraft,
    'an unavailable identity check must not overwrite the recoverable private draft with blank fields');
  assert.equal(starts.length, 0);
});

test('a resolved Supabase retryable identity error preserves an existing owner-scoped session draft', async () => {
  seedPending();
  authUser = reader;
  getSession = async () => { throw new Error('temporary session lookup failure'); };
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();
  assert.equal(currentQuestion(), originalQuestion);
  const recoveredDraft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
  assert.equal(recoveredDraft.question, originalQuestion);
  assert.deepEqual(recoveredDraft.background, background);
  await unmount();

  getUser = async () => ({
    data: { user: null },
    error: { name: 'AuthRetryableFetchError', message: 'temporary network failure', status: 0 }
  });
  dom.reconfigure({ url: 'https://tarot.example/#access_token=test-token&refresh_token=test-refresh&type=magiclink' });
  await render();

  assert.equal(currentQuestion(), '', 'private input must wait for a verified owner');
  assert.deepEqual(JSON.parse(sessionStorage.getItem(DRAFT_KEY)), recoveredDraft,
    'Supabase reports network failures as resolved errors, which must not be mistaken for a verified sign-out');
  assert.equal(starts.length, 0);
});

test('Supabase AuthSessionMissingError is handled as an ordinary signed-out visit', async () => {
  getUser = async () => ({
    data: { user: null },
    error: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 }
  });
  await render();

  assert.equal(currentQuestion(), '');
  assert.equal(displayedBackground().context, '');
  assert.equal(starts.length, 0);
  assert.equal(document.querySelector('[role="status"]'), null,
    'a visitor without a session should not see a temporary network failure message');
  assert.equal(document.querySelector('[role="alert"]'), null);
});
