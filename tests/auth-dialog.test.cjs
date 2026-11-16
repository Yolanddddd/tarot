const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

// Set up the DOM before loading React DOM so its event system uses browser events.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://tarot.example.test/'
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.sessionStorage = dom.window.sessionStorage;
global.localStorage = dom.window.localStorage;
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new dom.window.Event('close'));
};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const jsxRuntime = require('react/jsx-runtime');

function loadDialog(client, submissions) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/reading/AuthDialog.tsx'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  // Observe the returned promise without changing the real form handler or its state.
  // This lets a rejected handler fail an assertion instead of leaking an unhandled rejection.
  const observeSubmit = (render) => (type, props, key) => {
    if (type === 'form' && props.onSubmit) {
      const handler = props.onSubmit;
      props = { ...props, onSubmit(event) {
        const result = Promise.resolve(handler(event));
        result.catch(() => {});
        submissions.push(result);
      } };
    }
    return render(type, props, key);
  };
  const imports = {
    '../lib/supabase': { getSupabaseClient: async () => client, isSupabaseConfigured: () => Boolean(client) },
    react: React,
    'react/jsx-runtime': { ...jsxRuntime, jsx: observeSubmit(jsxRuntime.jsx), jsxs: observeSubmit(jsxRuntime.jsxs) }
  };
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output)(module, module.exports, (id) => {
    if (id in imports) return imports[id];
    throw new Error(`Unexpected import: ${id}`);
  });
  return module.exports.AuthDialog;
}

async function mount(t, signInWithOtp, props = {}, { resetStorage = true } = {}) {
  if (resetStorage) { sessionStorage.clear(); localStorage.clear(); }
  const calls = [];
  const saved = [];
  const submissions = [];
  const client = { auth: { signInWithOtp: async (input) => {
    calls.push(input);
    return signInWithOtp(input);
  } } };
  const Dialog = loadDialog(client, submissions);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true;
  const unmount = async () => {
    if (!mounted) return;
    mounted = false;
    await act(async () => root.unmount());
    container.remove();
  };
  t.after(unmount);
  await act(async () => root.render(React.createElement(Dialog, {
    onClose() {}, onEmailSent(email) { saved.push(email); return true; },
    onPhoneSent() { return true; }, ...props
  })));
  return { container, calls, saved, unmount,
    get button() { return container.querySelector('button[type="submit"]'); },
    async email(value) {
      const input = container.querySelector('#auth-email');
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    },
    async submit(count = 1) {
      let results;
      await act(async () => {
        const form = container.querySelector('form');
        const first = submissions.length;
        for (let i = 0; i < count; i++) {
          form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        }
        results = await Promise.allSettled(submissions.slice(first));
      });
      assert.deepEqual(results.filter((result) => result.status === 'rejected'), [],
        'form submissions must handle errors without rejecting');
    }
  };
}

test('email transport failure reports an error and restores the retry button', async (t) => {
  const view = await mount(t, async () => { throw new TypeError('Failed to fetch'); });
  await view.email('reader@example.com');
  await view.submit();
  assert.match(view.container.textContent, /失败.*网络|网络.*重试/);
  assert.equal(view.button.disabled, false);
  assert.deepEqual(view.saved, []);
});

test('unauthorized email recipients are directed to the administrator', async (t) => {
  const view = await mount(t, async () => ({ error: {
    code: 'email_address_not_authorized', status: 403, message: 'Email address not authorized'
  } }));
  await view.email('reader@example.com');
  await view.submit();
  assert.match(view.container.textContent, /联系.*管理员/);
  assert.doesNotMatch(view.container.textContent, /登录链接已发送/);
  assert.deepEqual(view.saved, []);
});

for (const [redirectPath, intent, expectedMessage] of [
  ['/', 'question', /推荐牌阵/],
  ['/spread/reading-id', 'result', /返回这次结果/]
]) {
  test(`email login preserves the ${intent} destination and pending identity`, async (t) => {
    const view = await mount(t, async () => ({ error: null }), { redirectPath, intent });
    await view.email(' Reader@Example.COM ');
    await view.submit();
    assert.deepEqual(view.calls, [{ email: 'reader@example.com', options: {
      emailRedirectTo: `https://tarot.example.test${redirectPath}`
    } }]);
    assert.deepEqual(view.saved, ['reader@example.com']);
    assert.match(view.container.textContent, /登录链接已发送/);
    assert.match(view.container.textContent, expectedMessage);
    assert.doesNotMatch(view.container.textContent, /微信|wechat/i);
    assert.equal(view.button.disabled, true);
    assert.match(view.button.textContent, /\d+ 秒后/);
  });
}

for (const error of [
  { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' },
  { code: 'over_request_rate_limit', message: 'Too many requests' },
  { status: 429, message: 'Too many requests' }
]) {
  test(`email rate limit ${error.code ?? error.status} prevents repeat sends without a success message`, async (t) => {
    const view = await mount(t, async () => ({ error }));
    await view.email('reader@example.com');
    await view.submit();
    assert.equal(view.button.disabled, true);
    assert.match(view.button.textContent, /\d+ 秒后/);
    assert.match(view.container.textContent, /额度|频繁/);
    assert.doesNotMatch(view.container.textContent, /登录链接已发送/);
    await view.submit();
    assert.equal(view.calls.length, 1);
    assert.deepEqual(view.saved, []);
  });
}

for (const outcome of ['success', 'rate limit']) {
  test(`closing and reopening the dialog preserves the ${outcome} retry restriction`, async (t) => {
    const response = outcome === 'success' ? { error: null } : { error: {
      code: 'over_email_send_rate_limit', status: 429, message: 'Email rate limit exceeded'
    } };
    const view = await mount(t, async () => response);
    await view.email('reader@example.com');
    await view.submit();
    await view.unmount();

    const reopened = await mount(t, async () => ({ error: null }), {}, { resetStorage: false });
    assert.equal(reopened.button.disabled, true);
    assert.match(reopened.button.textContent, /\d+ 秒后/);
    await reopened.email('reader@example.com');
    await reopened.submit();
    assert.equal(reopened.calls.length, 0);
  });
}

test('elapsed retry time expires even while the login dialog is closed', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const view = await mount(t, async () => ({ error: null }));
  await view.email('reader@example.com');
  await view.submit();
  await view.unmount();

  now += 61_000;
  const reopened = await mount(t, async () => ({ error: null }), {}, { resetStorage: false });
  assert.equal(reopened.button.disabled, false);
  await reopened.email('reader@example.com');
  await reopened.submit();
  assert.equal(reopened.calls.length, 1);
});

test('duplicate submit events in the same render send only one email', async (t) => {
  const view = await mount(t, async () => ({ error: null }));
  await view.email('reader@example.com');
  await view.submit(2);
  assert.equal(view.calls.length, 1);
  assert.deepEqual(view.saved, ['reader@example.com']);
});

test('blocked browser storage does not prevent sending or the current dialog cooldown', async (t) => {
  t.mock.method(dom.window.Storage.prototype, 'getItem', () => { throw new Error('Storage blocked'); });
  t.mock.method(dom.window.Storage.prototype, 'setItem', () => { throw new Error('Storage blocked'); });
  const view = await mount(t, async () => ({ error: null }));
  await view.email('reader@example.com');
  await view.submit();
  assert.match(view.container.textContent, /登录链接已发送/);
  assert.equal(view.button.disabled, true);
  await view.submit();
  assert.equal(view.calls.length, 1);
});

test('an open dialog uses elapsed time when a backgrounded timer resumes', async (t) => {
  let now = Date.now();
  let tick;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(window, 'setInterval', (callback) => { tick = callback; return 1; });
  t.mock.method(window, 'clearInterval', () => {});
  const view = await mount(t, async () => ({ error: null }));
  await view.email('reader@example.com');
  await view.submit();
  assert.equal(view.button.disabled, true);

  now += 61_000;
  await act(async () => tick());
  assert.equal(view.button.disabled, false);
  await view.submit();
  assert.equal(view.calls.length, 2);
});
