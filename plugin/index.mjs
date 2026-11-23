import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createBackend, resolveBinary} from './backend.mjs';
import {createBridge} from './bridge.mjs';

export const name = 'dsh-intelligence-check';
export const inject = ['llm'];

const root = fileURLToPath(new URL('../', import.meta.url));
const ROUTE = '/dsh-intelligence-check';
const SAFE_HEADERS = new Set([
  'content-type', 'cache-control', 'content-disposition', 'x-preview-candidates', 'x-preview-combined',
  'content-security-policy', 'permissions-policy',
]);

async function readCatalog(llm) {
  const providers = llm.listProviders();
  const settled = await Promise.allSettled(providers.map(provider => llm.listModels(provider.id)));
  const models = [];
  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status !== 'fulfilled') {
      console.error(`[dsh-intelligence-check] 模型提供方 ${provider.id} 目录读取失败：${result.reason?.message || String(result.reason)}`);
      return;
    }
    for (const model of result.value) {
      models.push({
        provider: provider.id,
        provider_name: provider.name,
        model: model.id,
        name: model.name,
      });
    }
  });
  if (providers.length > 0 && settled.every(result => result.status === 'rejected')) {
    throw new Error('所有模型提供方目录读取失败，保留上次目录');
  }
  return models;
}

// The Desktop Host is the only place that owns the shared check service. Its
// environment carries DSH_CLIENT_VERSION; a plain `dsh` CLI launch does not.
export function isDesktopHost(env = process.env, config = {}) {
  if (config.desktop === true) return true;
  if (env.DSH_INTELLIGENCE_CHECK_DESKTOP === '1') return true;
  return typeof env.DSH_CLIENT_VERSION === 'string' && env.DSH_CLIENT_VERSION !== '';
}

// One user-level store for every working directory and profile; never inside a
// profile directory, so old per-profile databases stay untouched. Only the
// host's DSH_HOME (or its default user directory) chooses it; legacy plugin
// config and environment overrides are ignored.
export function sharedDataDir(env = process.env) {
  return path.join(env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-intelligence-check');
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

function unavailable(response, error) {
  response.writeHead(503, {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'});
  response.end(`质量检测后台不可用：${error?.message || '请通过 DSH 桌面应用打开'}`);
}

export async function apply(ctx, config = {}) {
  const desktop = isDesktopHost(process.env, config);
  let backend;
  let bridge;
  if (desktop) {
    bridge = await createBridge(ctx.llm);
    backend = createBackend({
      binaryPath: resolveBinary(root, config),
      dataDir: sharedDataDir(process.env),
      bridge,
      shared: true,
    });
    ctx.effect(() => async () => {
      await backend.stop();
      await bridge.close();
    });
    try {
      await backend.start();
    } catch (error) {
      await bridge.close();
      throw error;
    }
  } else {
    // A CLI/Web host joins a running desktop backend read-only and never
    // starts or takes over the process.
    backend = createBackend({
      binaryPath: resolveBinary(root, config),
      dataDir: sharedDataDir(process.env),
      shared: true,
      manage: false,
    });
    await backend.attach();
  }
  let catalogSync;
  let catalogSyncedAt = 0;
  let catalogAttemptAt = 0;
  let catalogError;
  const syncCatalog = (force = false) => {
    if (!backend?.owner) return Promise.resolve();
    if (catalogSync) return catalogSync;
    if (catalogError && Date.now() - catalogAttemptAt < 10000) return Promise.reject(catalogError);
    if (!force && Date.now() - catalogSyncedAt < 30000) return Promise.resolve();
    catalogAttemptAt = Date.now();
    catalogSync = (async () => {
      try {
        const models = await readCatalog(ctx.llm);
        await backend.setCatalog(models);
        catalogSyncedAt = Date.now();
        catalogError = undefined;
        await writeFile(path.join(sharedDataDir(process.env), 'catalog-diagnostic.json'), JSON.stringify({at: new Date().toISOString(), pid: process.pid, desktop, owner: backend.owner, models: models.length})).catch(error => console.error(`[dsh-intelligence-check] 诊断写入失败：${error.message}`));
      } catch (error) {
        catalogError = error;
        console.error(`[dsh-intelligence-check] 模型目录同步失败：${error.message}`);
        throw error;
      } finally {
        catalogSync = undefined;
      }
    })();
    return catalogSync;
  };
  if (desktop) {
    // Subscribe even when this instance starts as a joiner, so the catalog
    // keeps updating after it takes over ownership.
    const refreshCatalog = () => syncCatalog(true).catch(() => {});
    ctx.on('llm/adapters-updated', refreshCatalog);
    ctx.on('llm/models-updated', refreshCatalog);
    await refreshCatalog();
    console.error(`[dsh-intelligence-check] backend ready, shared=${backend.origin}, owner=${backend.owner}`);
  } else {
    console.error(backend.origin
      ? `[dsh-intelligence-check] CLI host detected; joined shared desktop backend ${backend.origin}`
      : '[dsh-intelligence-check] CLI host detected; the shared desktop backend is not running');
  }

  // Native page API: the page calls same-origin, and this host half forwards to
  // the single shared backend with the owner control token.
  ctx.inject(['webServer', 'connection'], child => {
    child.effect(() => child.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (request, response, peer) => {
        // The WebServer authenticates required routes before passing the peer.
        if (peer?.principal?.kind !== 'owner') {
          response.statusCode = 403;
          response.end();
          return;
        }
        const suffix = (request.url || '').slice(ROUTE.length);
        if (!suffix.startsWith('/api/') && !suffix.startsWith('/modeltrace/')) {
          response.writeHead(404);
          response.end();
          return;
        }
        try {
        if (!backend?.origin) {
          // A CLI/Web host may have started before the desktop backend. Its
          // ensure() only attaches, so retry the join on first use.
          if (!(await backend.ensure())) {
            unavailable(response, new Error('请通过 DSH 桌面应用打开'));
            return;
          }
          if (backend.owner) await syncCatalog();
        }
          if (backend.owner && suffix === '/api/state') await syncCatalog();
          const headers = {authorization: 'Bearer ' + backend.control};
          for (const name of ['content-type', 'accept']) {
            if (request.headers[name]) headers[name] = request.headers[name];
          }
          const body = request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : await readBody(request);
          const forward = () => fetch(backend.origin + suffix, {
            method: request.method,
            headers,
            body,
            redirect: 'manual',
          });
          let upstream;
          try {
            upstream = await forward();
          } catch {
            // The desktop owner may have exited while this profile stayed open.
            if (!(await backend.ensure())) throw new Error('检测后台无法重新连接');
            if (backend.owner) await syncCatalog();
            headers.authorization = 'Bearer ' + backend.control;
            upstream = await forward();
          }
          response.statusCode = upstream.status;
          for (const [header, value] of upstream.headers) {
            if (SAFE_HEADERS.has(header)) response.setHeader(header, value);
          }
          if (request.method === 'HEAD' || !upstream.body) {
            response.end();
            return;
          }
          Readable.fromWeb(upstream.body).pipe(response);
        } catch (error) {
          unavailable(response, error);
        }
      },
    }), 'dsh-intelligence-check: native page API');
  });
}
