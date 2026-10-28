// Le pont entre le bureau et Claude Code. Il sert le bureau (dossier dist/) et ouvre une connexion
// WebSocket sur /ws. Il n'écoute que sur ton ordinateur (127.0.0.1), et refuse toute page qui ne vient
// pas du bureau lui-même : un site web ne peut pas lancer ton équipe à ta place.
//
//   node server/index.ts            le bureau sur http://localhost:4848
//   node server/index.ts --open     … et l'ouvre dans le navigateur
//   node server/index.ts --dev      seulement le pont (le bureau est servi par Vite, port 5174)
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, RepoReq, ServerMsg } from '../shared/protocol.ts';
import { Bureau } from './bureau.ts';
import { findClaude } from './claude.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const DEV = args.has('--dev');
const PORT = Number(process.env.PORT ?? 4848);
const HOST = '127.0.0.1';
const DEV_PORT = 5174;

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "media-src 'self' blob: data:", "worker-src 'self' blob:",
  `connect-src 'self' ws://localhost:${PORT} ws://127.0.0.1:${PORT}`, "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
].join('; ');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

// L'aperçu des sites faits par l'équipe : servis à part, dans un bac à sable (origine opaque) :
// leurs scripts tournent, mais ils ne peuvent ni lire le bureau, ni se connecter au pont.
const PREVIEW_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'";

const claude = await findClaude();
// la version du bureau compilé : un onglet resté ouvert se recharge quand elle change
const BUILD = (() => { try { return String(Math.round(statSync(path.join(DIST, 'index.html')).mtimeMs)); } catch { return 'dev'; } })();
const clients = new Set<WebSocket>();

function broadcast(m: ServerMsg) {
  const s = JSON.stringify(m);
  for (const c of clients) if (c.readyState === c.OPEN) c.send(s);
}

const bureau = new Bureau(claude, broadcast, process.env.BUREAU_DIR);
await bureau.init();

// ── Le serveur web (le bureau compilé) ──
// Le texte (script, style, page, JSON) part compressé : le script du bureau passe d'environ 480 Ko à 150 Ko. Chaque fichier
// n'est compressé qu'une fois (gardé en mémoire tant qu'il ne change pas).
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.md', '.csv']);
const brotli = promisify(brotliCompress);
const gz = promisify(gzip);
const packed = new Map<string, Buffer>();
async function pack(file: string, body: Uint8Array, enc: 'br' | 'gzip'): Promise<Buffer> {
  const key = `${enc}|${file}|${statSync(file).mtimeMs}`;
  let out = packed.get(key);
  if (!out) {
    out = enc === 'br' ? await brotli(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length } }) : await gz(body, { level: 9 });
    if (packed.size > 60) packed.clear();
    packed.set(key, out);
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url0 = new URL(req.url ?? '/', 'http://x');
  if (url0.pathname.startsWith('/apercu/')) { await preview(url0, res); return; }
  if (DEV) { res.writeHead(404).end(`Mode développement : le bureau est sur http://localhost:${DEV_PORT}`); return; }
  try {
    const url = url0;
    let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.writeHead(403).end(); return; }
    if (!existsSync(file) || file === DIST || file.endsWith(path.sep)) file = path.join(DIST, 'index.html');
    let body: Uint8Array = await readFile(file);
    const ext = path.extname(file);
    // les fichiers de assets/ ont un nom qui change quand leur contenu change : on peut les garder un an
    const hashed = path.relative(DIST, file).split(path.sep)[0] === 'assets';
    const headers: Record<string, string | number> = {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // aucun script venu d'ailleurs : même un lien piégé dans un rapport ne peut rien exécuter
      ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}),
    };
    if (COMPRESSIBLE.has(ext) && body.length > 1024) {
      const accepts = String(req.headers['accept-encoding'] ?? '');
      const enc = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null;
      if (enc) { body = await pack(file, body, enc); headers['Content-Encoding'] = enc; }
      headers['Vary'] = 'Accept-Encoding';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(500).end('Le bureau n’est pas compilé : lance « npm start ».');
  }
});

/** /apercu/<mission>/<chemin> : un fichier de la mission, dans le bac à sable. */
async function preview(url: URL, res: http.ServerResponse) {
  try {
    const parts = url.pathname.split('/').slice(2).map((p) => decodeURIComponent(p));
    const missionId = parts.shift() ?? '';
    let rel = parts.join('/');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const file = bureau.previewPath(missionId, rel);
    if (!file) { res.writeHead(404, { 'Content-Security-Policy': PREVIEW_CSP }).end('Introuvable dans le dossier de la mission.'); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Security-Policy': PREVIEW_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Security-Policy': PREVIEW_CSP }).end();
  }
}

// ── La connexion avec le bureau ──
// Seul le bureau lui-même peut se connecter (et, en développement, la page servie par Vite).
const allowedOrigins = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, ...(DEV ? [`http://localhost:${DEV_PORT}`, `http://127.0.0.1:${DEV_PORT}`] : [])]);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin ?? '';
  if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws' || !allowedOrigins.has(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  const send = (m: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  send({ ...bureau.hello(), build: BUILD } as ServerMsg);
  ws.on('message', async (data) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(data)); } catch { return; }
    try {
      await handle(m, send);
    } catch (e) {
      send({ t: 'toast', kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  });
});

const str = (v: unknown, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');

async function handle(m: ClientMsg, send: (m: ServerMsg) => void) {
  switch (m.t) {
    case 'start':
      await bureau.start(str(m.prompt));
      break;
    case 'say':
      bureau.say(str(m.text));
      break;
    case 'stop':
      bureau.stop(m.force === true);
      break;
    case 'answer':
      bureau.answer(str(m.requestId, 100), m.allow === true, m.message ? str(m.message, 4000) : undefined, m.branch ? str(m.branch, 200) : undefined);
      break;
    case 'new':
      bureau.close();
      break;
    case 'open':
      bureau.open(str(m.missionId, 40), m.file ? str(m.file, 1000) : undefined);
      break;
    case 'open_root':
      bureau.openRoot(m.rules === true);
      break;
    case 'read': {
      const file = str(m.file, 1000);
      const version = m.version ? str(m.version, 120) : undefined;
      const { text, truncated } = await bureau.readText(str(m.missionId, 40), file, version);
      send({ t: 'file_text', missionId: m.missionId, file, text, truncated, version });
      break;
    }
    case 'versions': {
      const file = str(m.file, 1000);
      send({ t: 'versions', missionId: m.missionId, file, list: await bureau.versions(str(m.missionId, 40), file) });
      break;
    }
    case 'search': {
      const q = str(m.q, 200);
      send({ t: 'search', q, hits: bureau.search(q) });
      break;
    }
    case 'stats': {
      const days = Math.max(0, Math.min(3650, Math.round(Number(m.days) || 0)));
      send({ t: 'stats', stats: bureau.stats(days) });
      break;
    }
    case 'repo': {
      // seulement ce que git comprend : chaque champ est vérifié (types, longueurs) ici, puis encore dans repo.ts
      const op = str(m.op, 20) as RepoReq['op'];
      const strs = (v: unknown) => (Array.isArray(v) ? v.slice(0, 500).map((x) => str(x, 1000)) : undefined);
      send(await bureau.repo({
        op, ref: m.ref === undefined ? undefined : str(m.ref, 200), all: m.all === true, skip: Number(m.skip) || 0, hash: m.hash === undefined ? undefined : str(m.hash, 40),
        path: m.path === undefined ? undefined : str(m.path, 1000), paths: strs(m.paths), staged: m.staged === true,
        branch: m.branch === undefined ? undefined : str(m.branch, 200), remote: m.remote === true, name: m.name === undefined ? undefined : str(m.name, 200),
        from: m.from === undefined ? undefined : str(m.from, 200), force: m.force === true, message: m.message === undefined ? undefined : str(m.message, 10_000),
        all_changes: m.all_changes === true, pop: m.pop === true, mode: m.mode === 'merge' || m.mode === 'rebase' ? m.mode : undefined,
      }));
      break;
    }
    case 'week':
      send({ t: 'week', days: bureau.week() });
      break;
    case 'team_history':
      send({ t: 'team_history', entries: await bureau.teamHistory() });
      break;
    case 'replay': {
      const { mission, log } = await bureau.replay(str(m.missionId, 40));
      send({ t: 'replay', mission, log });
      break;
    }
    case 'settings':
      bureau.setSettings(m.settings ?? {});
      break;
    case 'quota_refresh':
      await bureau.refreshQuota();
      break;
    case 'mcp_list':
      send(await bureau.mcpList());
      break;
    case 'resume':
      await bureau.resume(str(m.missionId, 40));
      break;
    case 'pick_folder':
      await bureau.pickFolder();
      break;
    case 'diff': {
      const missionId = str(m.missionId, 40);
      send({ t: 'diff', missionId, ...(await bureau.diff(missionId)) });
      break;
    }
    case 'git': {
      const missionId = str(m.missionId, 40);
      const sendStatus = async () => {
        try { send({ t: 'git_status', missionId, status: await bureau.gitStatus(missionId) }); }
        catch (e) { send({ t: 'git_status', missionId, status: null, text: e instanceof Error ? e.message : String(e) }); }
      };
      if (m.action === 'status') { await sendStatus(); break; }
      if (m.action !== 'commit' && m.action !== 'push' && m.action !== 'switch_base' && m.action !== 'delete_branch') break;
      const r = await bureau.gitAction(missionId, m.action, str(m.message, 5000));
      send({ t: 'git_done', missionId, action: m.action, ...r });
      await sendStatus();
      break;
    }
  }
}

function listen(port: number) {
  server.once('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`  Le port ${port} est déjà pris : le bureau tourne peut-être déjà (http://localhost:${port}).`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(port, HOST, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  🏢  Le Bureau des agents');
    console.log(`  ➜  ${DEV ? `Pont prêt (le bureau : http://localhost:${DEV_PORT})` : url}`);
    console.log(`  📁  Les missions : ${bureau.missionsDir}`);
    console.log(claude ? `  ✓  Claude Code ${claude.version} (${claude.path})` : '  ✗  Claude Code introuvable : le bureau tournera en démo.');
    console.log('  ⏹  Pour arrêter : Ctrl + C');
    console.log('');
    if (args.has('--open') && !DEV) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
      execFile(opener, [url], () => {});
    }
  });
}

listen(PORT);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    bureau.shutdown();
    setTimeout(() => process.exit(0), 300);
  });
}
