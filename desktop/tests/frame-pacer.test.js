import test from 'node:test';
import assert from 'node:assert/strict';
import { createFramePacer } from '../src/frame-pacer.js';

test('honors the selected limit on displays whose refresh does not divide it', () => {
  for (const refresh of [60, 75, 90, 120, 144]) {
    for (const limit of [30, 60]) {
      const pacer = createFramePacer(0);
      let frames = 0;
      for (let i = 1; i <= refresh * 10; i++) {
        if (pacer.advance(i * 1000 / refresh, limit) !== null) frames++;
      }
      assert.ok(Math.abs(frames / 10 - limit) < 1,
        `${refresh} Hz display, ${limit} fps limit: got ${frames / 10} fps`);
    }
  }
});

test('uncapped draws every callback and reset excludes hidden time', () => {
  const pacer = createFramePacer(0);
  assert.equal(pacer.advance(4, 0), 0.004);
  assert.equal(pacer.advance(8, 0), 0.004);
  pacer.reset(60_000);
  assert.equal(pacer.advance(60_016, 0), 0.016);
  assert.equal(pacer.advance(70_000, 60), 0.1);
});
