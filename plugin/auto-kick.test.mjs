import test from 'node:test';
import assert from 'node:assert/strict';
import {core} from './client-core.mjs';

const target = (provider, model, enabled) => ({provider, model, enabled});
const state = (autoEnabled, targets) => ({config: {auto_enabled: autoEnabled}, targets});
const pick = list => list.map(item => `${item.provider}/${item.model}`);

test('turning one target on kicks exactly that target when automatic checks are on', () => {
  const s = state(true, [target('a', 'x', false), target('b', 'y', true)]);
  assert.deepEqual(pick(core.autoKickTargets(s, {type: 'target', provider: 'a', model: 'x', enabled: true})), ['a/x']);
});

test('turning a target off never kicks, with or without automatic checks', () => {
  for (const auto of [true, false]) {
    const s = state(auto, [target('a', 'x', true)]);
    assert.deepEqual(core.autoKickTargets(s, {type: 'target', provider: 'a', model: 'x', enabled: false}), []);
  }
});

test('turning a target on does nothing while automatic checks are off', () => {
  const s = state(false, [target('a', 'x', false)]);
  assert.deepEqual(core.autoKickTargets(s, {type: 'target', provider: 'a', model: 'x', enabled: true}), []);
});

test('enabling automatic checks kicks every enabled target and no disabled one', () => {
  const s = state(false, [target('a', 'x', true), target('b', 'y', false), target('c', 'z', true)]);
  assert.deepEqual(pick(core.autoKickTargets(s, {type: 'auto', enabled: true})), ['a/x', 'c/z']);
});

test('disabling automatic checks and unrelated changes kick nothing', () => {
  const s = state(true, [target('a', 'x', true)]);
  assert.deepEqual(core.autoKickTargets(s, {type: 'auto', enabled: false}), []);
  assert.deepEqual(core.autoKickTargets(s, null), []);
  assert.deepEqual(core.autoKickTargets(null, {type: 'target', provider: 'a', model: 'x', enabled: true}), []);
});