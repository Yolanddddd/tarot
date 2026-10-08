const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/app/deviceClass.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const moduleRef = { exports: {} };
new Function('module', 'exports', 'require', outputText)(moduleRef, moduleRef.exports, require);
const { isPhoneDevice, isPortableTouchDevice } = moduleRef.exports;

test('desktop remains desktop even when its browser window is narrow', () => {
  assert.equal(isPhoneDevice({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    maxTouchPoints: 10, coarsePointer: true, screenWidth: 1920, screenHeight: 1080
  }), false);
});

test('iPad uses the original desktop scene', () => {
  assert.equal(isPhoneDevice({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15',
    maxTouchPoints: 5, coarsePointer: true, screenWidth: 768, screenHeight: 1024
  }), false);
});

test('iPad uses smaller card images without switching to the phone layout', () => {
  const ipad = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15',
    maxTouchPoints: 5, coarsePointer: true, screenWidth: 768, screenHeight: 1024
  };
  assert.equal(isPhoneDevice(ipad), false);
  assert.equal(isPortableTouchDevice(ipad), true);
  assert.equal(isPortableTouchDevice({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    maxTouchPoints: 10, coarsePointer: true, screenWidth: 1920, screenHeight: 1080
  }), false);
});

test('iPhone and Android phones use the landscape card table', () => {
  for (const userAgent of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36']) {
    assert.equal(isPhoneDevice({
      userAgent, maxTouchPoints: 5, coarsePointer: true, screenWidth: 844, screenHeight: 390
    }), true);
  }
});
