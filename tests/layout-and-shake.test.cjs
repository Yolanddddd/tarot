const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require);
  return module.exports;
}
const { getTableLayout, fitSpread, spreadDeckCenters } = load('src/tarot/tableLayout.ts');
const { createShakeDetector } = load('src/gesture/shakeDetector.ts');
const spreads = require('../src/config/spreads.json');

test('all 78 cards remain ordered and inside the table at every focus position', () => {
  for (const width of [280, 540, 619, 796, 976, 1224, 1800]) {
    for (const focus of [null, ...Array.from({ length: 78 }, (_, i) => i)]) {
      const cardWidth = width < 600 ? 42 : 72;
      const centers = spreadDeckCenters(width, cardWidth, 78, focus);
      assert.equal(centers.length, 78);
      assert(centers[0] - cardWidth / 2 >= 0);
      assert(centers.at(-1) + cardWidth / 2 <= width);
      centers.slice(1).forEach((x, i) => assert(x > centers[i], `Overlapping centers at ${width}/${focus}/${i}`));
    }
  }
});

test('spread projection preserves original relative directions, scale, and ordering', () => {
  for (const spread of Object.values(spreads)) {
    for (const [width, height] of [[540, 64], [796, 115], [976, 430], [1224, 600]]) {
      const slots = fitSpread(spread.slots, width, height, 4);
      const unit = slots[0].width / .82;
      for (let i = 0; i < slots.length; i++) {
        assert(Math.abs((slots[i].x - slots[0].x) - (spread.slots[i].x - spread.slots[0].x) * unit) < 1e-8);
        assert(Math.abs((slots[i].y - slots[0].y) + (spread.slots[i].y - spread.slots[0].y) * unit) < 1e-8);
        assert(slots[i].y - slots[i].height / 2 >= 0);
        assert(slots[i].y + slots[i].height / 2 <= height);
      }
    }
  }
});

test('phone, tablet, and desktop reserve separate spread and deck space', () => {
  for (const [width, height] of [[540, 134], [619, 216], [796, 225], [976, 520], [1224, 650]]) {
    for (const spread of Object.values(spreads)) {
      const layout = getTableLayout(width, height, spread.slots, 78, 38);
      const spreadBottom = Math.max(...layout.spread.map((s) => s.y + s.height / 2));
      const deckTop = Math.min(...layout.deck.map((s) => s.y - s.height / 2));
      assert(spreadBottom < deckTop, `${width}x${height}/${spread.id} overlaps`);
      assert(layout.deck.every((c) => c.y + c.height / 2 <= height));
    }
  }
});

test('ordinary movement and isolated impulses do not shuffle', () => {
  const detector = createShakeDetector();
  for (let i = 0; i < 30; i++) assert.equal(detector.sample({ x: i / 5, y: 0, z: 9.8, timestamp: i * 100 }), false);
  assert.equal(detector.sample({ x: 24, y: 0, z: 9.8, timestamp: 3000 }), false);
  detector.reset();
  assert.equal(detector.sample({ x: NaN, y: 0, z: 9.8, timestamp: 4000 }), false);
});

test('three deliberate impulses trigger once and honor cooldown / reset', () => {
  const detector = createShakeDetector();
  const values = [0, 18, -18, 18];
  const results = values.map((x, i) => detector.sample({ x, y: 0, z: 9.8, timestamp: i * 120 }));
  assert.deepEqual(results, [false, false, false, true]);
  for (let i = 4; i < 12; i++) assert.equal(detector.sample({ x: i % 2 ? 18 : -18, y: 0, z: 9.8, timestamp: i * 120 }), false);
  detector.reset();
  assert.equal(detector.sample({ x: 18, y: 0, z: 9.8, timestamp: 4000 }), false);
});

test('moderate phone motion triggers without requiring unusually strong impacts', () => {
  const detector = createShakeDetector();
  const values = [0, 7, -1, 8];
  const results = values.map((x, i) => detector.sample({ x, y: 0, z: 9.8, timestamp: i * 180 }));
  assert.deepEqual(results, [false, false, false, true]);
});
