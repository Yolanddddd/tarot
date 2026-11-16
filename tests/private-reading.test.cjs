const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(relativePath, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output)(module, module.exports, (id) => {
    if (id in imports) return imports[id];
    throw new Error(`Unexpected import: ${id}`);
  });
  return module.exports;
}

const helper = loadTs('api/_privateReading.ts');
const background = { stage: '硕士', region: '英国', timeframe: '今年', concern: '', context: '论文正在修改' };

test('private reading does not turn a server 401 into a false signed-out state', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/results/PrivateInterpretation.tsx'), 'utf8');
  assert.doesNotMatch(source, /if \(next\.response\.status === 401\) \{ setAuth\(null\)/);
  assert.match(source, /if \(next\.response\.status === 401\) \{\s*throw new Error/);
});

test('private input accepts only bounded question and BG fields', () => {
  assert.deepEqual(helper.parsePrivateRequest({
    sessionId: 'id', question: ' 我今年能顺利毕业吗？ ',
    background: { ...background, extra: 'secret' }
  }), { sessionId: 'id', question: '我今年能顺利毕业吗？', background });
  assert.equal(helper.parsePrivateRequest({ sessionId: 'id', question: '短', background }), null);
  assert.equal(helper.parsePrivateRequest({ sessionId: 'id', question: '我今年能顺利毕业吗？',
    background: { ...background, context: 'x'.repeat(401) } }), null);
});

test('private AI output requires every expected slot in order', () => {
  const result = {
    overallMessage: '这组牌提示你把注意力放在眼前的论文修改与沟通上，同时为不同结果预留空间。可以先整理反馈，再决定需要向谁寻求支持。',
    cardReadings: [
      { slotId: 'top', text: '现状显示你正处于需要整理反馈的阶段。' },
      { slotId: 'center', text: '阻碍可能是时间安排与自我怀疑。' }
    ],
    actions: ['列出论文修改的优先顺序。', '与导师确认下一次反馈时间。'],
    reflectionQuestions: ['哪些担忧可以用一个具体行动回应？']
  };
  assert.deepEqual(helper.parsePrivateInterpretation(result, ['top', 'center']), result);
  assert.equal(helper.parsePrivateInterpretation(result, ['top', 'center', 'bottom']), null);
  assert.equal(helper.parsePrivateInterpretation({ ...result,
    cardReadings: [...result.cardReadings].reverse() }, ['top', 'center']), null);
});

test('private endpoint rejects unauthenticated access before touching database', async () => {
  const handler = loadTs('api/private-interpret.ts', {
    'node:crypto': { randomUUID: () => 'lease' },
    '@supabase/supabase-js': { createClient: () => { throw new Error('Database must not be called'); } },
    '../src/tarot/tarotDeck.js': { tarotDeckMap: new Map() },
    './_publicSession.js': { validatePublicSession: () => null },
    './_privateReading.js': helper
  }).default;
  const res = { statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; }
  };
  await handler({ method: 'GET', headers: {}, query: { sessionId: '00000000-0000-4000-8000-000000000000' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('private endpoint claims one reading but does not call DeepSeek after daily cap', async () => {
  const prior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
  };
  const oldFetch = global.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'server-test-key', DEEPSEEK_API_KEY: 'model-test-key' });
  let released = false;
  global.fetch = () => { throw new Error('DeepSeek must not be called'); };
  try {
    const handler = loadTs('api/private-interpret.ts', {
      'node:crypto': { randomUUID: () => 'lease-token' },
      '@supabase/supabase-js': { createClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'owner-id' } } }) },
        from: (table) => {
          assert.equal(table, 'spread_sessions');
          const query = { select() { return this; }, eq() { return this; },
            async maybeSingle() { return { data: { payload: { id: 'spread-id' } } }; } };
          return query;
        },
        rpc: async (name, args) => {
          if (name === 'claim_private_interpretation') {
            assert.equal(args.p_user_id, 'owner-id');
            assert.equal(args.p_question, '我今年能顺利毕业吗？');
            return { data: 'claimed' };
          }
          if (name === 'reserve_anonymous_interpretation') return { data: false };
          if (name === 'release_private_interpretation') { released = true; return { data: null }; }
          throw new Error(`Unexpected RPC: ${name}`);
        }
      }) },
      '../src/tarot/tarotDeck.js': { tarotDeckMap: new Map() },
      './_publicSession.js': { validatePublicSession: () => ({ spread: { slots: [] }, cards: [] }) },
      './_privateReading.js': helper
    }).default;
    const res = { statusCode: 200, body: null, headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(name, value) { this.headers[name] = value; },
      json(body) { this.body = body; }
    };
    await handler({ method: 'POST', headers: { authorization: 'Bearer valid-user-token' }, query: {},
      body: { sessionId: '00000000-0000-4000-8000-000000000000', question: '我今年能顺利毕业吗？',
        background } }, res);
    assert.equal(res.statusCode, 429);
    assert.equal(released, true);
  } finally {
    global.fetch = oldFetch;
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('successful private generation is stored once and returned only through the owner endpoint', async () => {
  const prior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
  };
  const oldFetch = global.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'server-test-key', DEEPSEEK_API_KEY: 'model-test-key' });
  const interpretation = {
    overallMessage: '这组牌提示你把重点放在论文修改、反馈沟通与时间管理上。结果仍有不确定性，但你可以先把下一步拆成可执行的小任务。',
    cardReadings: [{ slotId: 'top', text: '现状显示你正处于需要整理反馈的阶段。' }],
    actions: ['列出论文修改的优先顺序。', '与导师确认下一次反馈时间。'],
    reflectionQuestions: ['哪些担忧可以用一个具体行动回应？']
  };
  let completeCalls = 0;
  let releaseCalls = 0;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const promptData = JSON.parse(body.input);
    assert.equal(promptData.question, '我今年能顺利毕业吗？');
    assert.equal(promptData.background.context, '论文正在修改');
    assert.equal(body.max_output_tokens, 460);
    return { ok: true, json: async () => ({ status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(interpretation) }] }],
      usage: { input_tokens: 700, output_tokens: 300 } }) };
  };
  try {
    const handler = loadTs('api/private-interpret.ts', {
      'node:crypto': { randomUUID: () => 'lease-token' },
      '@supabase/supabase-js': { createClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'owner-id' } } }) },
        from: (table) => {
          const filters = {};
          return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
            async maybeSingle() {
              if (table === 'spread_sessions') return { data: { payload: { id: 'spread-id' } } };
              assert.equal(filters.user_id, 'owner-id');
              if (table === 'private_interpretations') return { data: {
                question: '我今年能顺利毕业吗？', background, interpretation,
                model: 'deepseek-flash', completed_at: '2026-11-07T10:00:00Z', status: 'complete'
              } };
              if (table === 'private_reading_entitlements') return { data: { used_count: 1 } };
              throw new Error(`Unexpected table: ${table}`);
            } };
        },
        rpc: async (name, args) => {
          if (name === 'claim_private_interpretation') return { data: 'claimed' };
          if (name === 'reserve_anonymous_interpretation') return { data: true };
          if (name === 'complete_private_interpretation') {
            completeCalls += 1;
            assert.deepEqual(args.p_interpretation, interpretation);
            assert.equal(args.p_input_tokens, 700);
            return { data: true };
          }
          if (name === 'release_private_interpretation') { releaseCalls += 1; return { data: null }; }
          throw new Error(`Unexpected RPC: ${name}`);
        }
      }) },
      '../src/tarot/tarotDeck.js': { tarotDeckMap: new Map([['card-a', { label: '愚者' }]]) },
      './_publicSession.js': { validatePublicSession: () => ({
        spread: { label: '未来十字', slots: [{ label: '现状', description: '当下的处境' }] },
        cards: [{ cardId: 'card-a', slotId: 'top', isReversed: false }]
      }) },
      './_privateReading.js': helper
    }).default;
    const res = { statusCode: 200, body: null, headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(name, value) { this.headers[name] = value; },
      json(body) { this.body = body; }
    };
    await handler({ method: 'POST', headers: { authorization: 'Bearer valid-user-token' }, query: {},
      body: { sessionId: '00000000-0000-4000-8000-000000000000', question: '我今年能顺利毕业吗？',
        background } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.freeRemaining, 2);
    assert.deepEqual(res.body.interpretation, interpretation);
    assert.equal(completeCalls, 1);
    assert.equal(releaseCalls, 1);
  } finally {
    global.fetch = oldFetch;
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('private SQL grants no direct access to anonymous or authenticated visitors', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'private_interpretations.sql'), 'utf8');
  assert.match(sql, /revoke all on public\.private_interpretations from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.private_reading_entitlements from anon, authenticated/i);
  assert.match(sql, /first_success_at = coalesce\(first_success_at, completed_time\)/i);
  assert.match(sql, /used_count = used_count \+ 1/i);
});
