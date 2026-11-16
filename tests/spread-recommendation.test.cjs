const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', '_spreadRecommendation.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const moduleUnderTest = { exports: {} };
new Function('module', 'exports', 'require', outputText)(moduleUnderTest, moduleUnderTest.exports, require);
const { parseSpreadRecommendation } = moduleUnderTest.exports;

const endpointSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'recommend-spread.ts'), 'utf8');
const endpoint = ts.transpileModule(endpointSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function loadHandler(createClient) {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', endpoint)(module, module.exports, (id) => {
    if (id === '@supabase/supabase-js') return { createClient };
    if (id === './_spreadRecommendation.js') return moduleUnderTest.exports;
    throw new Error(`Unexpected import: ${id}`);
  });
  return module.exports.default;
}

function response() {
  const result = { statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; }
  };
  return result;
}

test('accepts a valid AI spread recommendation', () => {
  assert.deepEqual(parseSpreadRecommendation({
    spreadId: 'hexagram', category: 'application', reason: '问题涉及多个选择，适合从不同角度梳理。'
  }), {
    spreadId: 'hexagram', category: 'application', reason: '问题涉及多个选择，适合从不同角度梳理。'
  });
});

test('rejects invalid spread IDs, categories and unusable explanations', () => {
  const base = { spreadId: 'futureCross', category: 'study', reason: '聚焦单一学业目标，适合梳理下一步。' };
  assert.equal(parseSpreadRecommendation({ ...base, spreadId: 'celticCross' }), null);
  assert.equal(parseSpreadRecommendation({ ...base, category: 'medical' }), null);
  assert.equal(parseSpreadRecommendation({ ...base, reason: '太短' }), null);
  assert.equal(parseSpreadRecommendation({ ...base, reason: 'x'.repeat(181) }), null);
  assert.equal(parseSpreadRecommendation(null), null);
});

test('AI routing endpoint rejects missing auth and invalid questions before spending quota', async () => {
  const handler = loadHandler(() => { throw new Error('Database must not be called'); });
  const unauthenticated = response();
  await handler({ method: 'POST', headers: {}, body: { question: '我能顺利毕业吗？' } }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  const invalid = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer token' },
    body: { question: '短' } }, invalid);
  assert.equal(invalid.statusCode, 400);
});

test('AI routing endpoint respects the shared daily quota', async () => {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
  };
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'server-only-test-key',
    DEEPSEEK_API_KEY: 'server-only-test-key'
  });
  let calls = 0;
  try {
    const handler = loadHandler(() => ({
      auth: { getUser: async (token) => { assert.equal(token, 'valid-token'); return { data: { user: { id: 'user' } } }; } },
      rpc: async (name) => { calls += 1; assert.equal(name, 'reserve_anonymous_interpretation'); return { data: false }; }
    }));
    const res = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer valid-token' },
      body: { question: '我能顺利毕业吗？' } }, res);
    assert.equal(calls, 1);
    assert.equal(res.statusCode, 429);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
