import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBridge} from './bridge.mjs';

// 后台 Go 端每次调用都送它自己硬编码的 8192，所以桥接层的 16384 是「下限」而不是
// 「缺省」：推理模型光思考就能吃掉 8192，回答还没开始就被截断成空回答。
const FLOOR_MAX_TOKENS = 16384;
const GO_DEFAULT_MAX_TOKENS = 8192;

function collector() {
  const captured = [];
  const llm = {
    stream(request) {
      captured.push(request);
      return (async function* () {
        yield {type: 'text-delta', text: 'ok'};
        yield {type: 'finish', reason: {kind: 'stop'}};
      })();
    },
  };
  return {captured, llm};
}

async function send(bridge, body) {
  const response = await fetch(bridge.url + '/generate', {
    method: 'POST',
    headers: {authorization: 'Bearer ' + bridge.token, 'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  return response.text();
}

const request = extra => ({
  request_id: 'r1',
  target: {provider: 'p', model: 'm'},
  prompt: 'hello',
  ...extra,
});

test('a request without params gets a budget that reasoning can finish in', async () => {
  const {captured, llm} = collector();
  const bridge = await createBridge(llm);
  try {
    await send(bridge, request({}));
    assert.equal(captured[0].maxTokens, FLOOR_MAX_TOKENS);
  } finally {
    await bridge.close();
  }
});

test("the backend's own 8192 default is raised to the floor instead of truncating the answer", async () => {
  const {captured, llm} = collector();
  const bridge = await createBridge(llm);
  try {
    await send(bridge, request({params: {max_tokens: GO_DEFAULT_MAX_TOKENS}}));
    assert.equal(captured[0].maxTokens, FLOOR_MAX_TOKENS);
  } finally {
    await bridge.close();
  }
});

test('a caller that asks for more than the floor keeps its own budget', async () => {
  const {captured, llm} = collector();
  const bridge = await createBridge(llm);
  try {
    await send(bridge, request({params: {max_tokens: 32768}}));
    assert.equal(captured[0].maxTokens, 32768);
  } finally {
    await bridge.close();
  }
});

test('a non-positive max_tokens falls back to the floor instead of truncating to nothing', async () => {
  const {captured, llm} = collector();
  const bridge = await createBridge(llm);
  try {
    await send(bridge, request({params: {max_tokens: 0}}));
    await send(bridge, request({params: {max_tokens: -5}}));
    assert.equal(captured[0].maxTokens, FLOOR_MAX_TOKENS);
    assert.equal(captured[1].maxTokens, FLOOR_MAX_TOKENS);
  } finally {
    await bridge.close();
  }
});