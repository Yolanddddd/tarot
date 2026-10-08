const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('every deck card has a valid local image in the manifest', () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'src/tarot/tarotDeck.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require);
  const deck = module.exports.tarotDeck;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'public/cards/rider-waite/manifest.json'), 'utf8')
  ).cards;

  assert.equal(deck.length, 78);
  assert.equal(Object.keys(manifest).length, 78);
  for (const card of deck) {
    const file = manifest[card.id];
    assert.equal(file, `${card.id}.jpg`, `Unexpected asset for ${card.id}`);
    const bytes = fs.readFileSync(path.join(root, 'public/cards/rider-waite', file));
    assert(bytes.length > 1000, `Empty asset for ${card.id}`);
    assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8', `Invalid JPEG: ${card.id}`);
    assert.equal(bytes.subarray(-2).toString('hex'), 'ffd9', `Incomplete JPEG: ${card.id}`);
  }
});
