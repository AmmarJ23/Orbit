import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderLoop } from '../src/render-loop.js';

function harness() {
  let time = 0;
  let sequence = 0;
  const pending = new Map();
  const rendered = [];
  const resets = [];
  const loop = createRenderLoop({
    render: stamp => rendered.push(stamp),
    reset: stamp => resets.push(stamp),
    requestFrame: callback => { pending.set(++sequence, callback); return sequence; },
    cancelFrame: id => pending.delete(id),
    now: () => time,
  });
  return { loop, pending, rendered, resets, advance(stamp) {
    time = stamp;
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach(callback => callback(stamp));
  } };
}

test('close/minimize cancels all frames; reopening resets the clock after a long sleep', () => {
  const h = harness();
  h.loop.setVisible('document', true);
  h.loop.setVisible('native', true);
  h.advance(16);
  assert.deepEqual(h.rendered, [16]);
  h.loop.setVisible('native', false);
  assert.equal(h.pending.size, 0);
  h.advance(60_000);
  assert.deepEqual(h.rendered, [16]);
  h.loop.setVisible('native', true);
  assert.equal(h.resets.at(-1), 60_000);
  h.advance(60_016);
  assert.deepEqual(h.rendered, [16, 60_016]);
});

test('each visibility gate must reopen; repeated events never start a second loop', () => {
  const h = harness();
  h.loop.setVisible('native', false);
  h.loop.setVisible('document', false);
  h.loop.setVisible('native', true);
  assert.equal(h.pending.size, 0);
  h.loop.setVisible('document', true);
  h.loop.setVisible('native', true);
  h.loop.setVisible('document', true);
  assert.equal(h.pending.size, 1);
  h.advance(16);
  assert.equal(h.rendered.length, 1);
  assert.equal(h.pending.size, 1);
});
