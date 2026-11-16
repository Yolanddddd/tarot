const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', '_cacheKey.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const moduleUnderTest = { exports: {} };
new Function('module', 'exports', 'require', outputText)(moduleUnderTest, moduleUnderTest.exports, require);
const { buildInterpretationCacheKey } = moduleUnderTest.exports;

const base = {
  promptVersion: 'anonymous-overall-deepseek-v1', provider: 'deepseek', model: 'deepseek-flash',
  spreadId: 'futureCross', meaningVersion: 'study-abroad-v1',
  cards: [
    { cardId: 'major-00-the-fool', isReversed: false },
    { cardId: 'cups-ace', isReversed: true }
  ]
};

test('identical anonymous readings have the same opaque cache key', () => {
  const first = buildInterpretationCacheKey(base);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, buildInterpretationCacheKey(structuredClone(base)));
  assert(!first.includes('major-00'));
});

test('cache key changes with card, position, orientation, spread or interpretation version', () => {
  const key = buildInterpretationCacheKey(base);
  const variants = [
    { ...base, cards: [...base.cards].reverse() },
    { ...base, cards: [{ cardId: 'major-01-the-magician', isReversed: false }, base.cards[1]] },
    { ...base, cards: [{ ...base.cards[0], isReversed: true }, base.cards[1]] },
    { ...base, spreadId: 'hexagram' },
    { ...base, meaningVersion: 'study-abroad-v2' },
    { ...base, promptVersion: 'anonymous-overall-v2' },
    { ...base, provider: 'another-provider' },
    { ...base, model: 'different-model' }
  ];
  for (const variant of variants) assert.notEqual(buildInterpretationCacheKey(variant), key);
});
