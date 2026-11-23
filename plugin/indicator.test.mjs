import test from 'node:test';
import assert from 'node:assert/strict';
import {core} from './client-core.mjs';
const record = (verdict, extra = {}) => ({provider:'p', model:'m', prompt:'milk', time:'2026-11-23T12:00:00Z', verdict, ...extra});
const status = (results, error) => core.indicatorStatus({results}, error);
test('indicator: empty and disconnected cannot appear passed', () => {
 assert.equal(status([]).tone, 'idle');
 assert.equal(status([record('passed')], new Error('offline')).tone, 'error');
});
test('indicator: any concurrent running check takes priority over latest pass', () => {
 const s = status([record('running'), record('passed', {model:'other',time:'2026-11-23T12:01:00Z'})]);
 assert.equal(s.tone, 'running'); assert.equal(s.record.model, 'm');
});
test('indicator: same target and prompt failed then passed is yellow; unrelated failures do not count', () => {
 assert.equal(status([record('failed'),record('passed',{time:'2026-11-23T12:01:00Z'})]).tone,'retested');
 assert.equal(status([record('failed',{model:'other'}),record('passed',{time:'2026-11-23T12:01:00Z'})]).tone,'passed');
 assert.equal(status([record('failed',{prompt:'repeat'}),record('passed',{time:'2026-11-23T12:01:00Z'})]).tone,'passed');
});
test('indicator: latest timestamp wins even if results are unsorted; manual, failure, error distinct', () => {
 assert.equal(status([record('passed',{time:'2026-11-23T12:01:00Z'}),record('failed')]).tone,'retested');
 for (const [verdict,tone] of [['manual','manual'],['failed','failed'],['unavailable','error'],['empty','failed'],['truncated','error']]) assert.equal(status([record(verdict)]).tone,tone);
 assert.equal(status([record('manual',{prompt:'modeltrace'})]).tone,'idle');
});
