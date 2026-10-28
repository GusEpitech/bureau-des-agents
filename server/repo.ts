// Le mode Git : le dépôt du dossier de travail, comme dans un IDE (branches, historique, changements, pull, push…).
// Toujours git lancé directement (jamais un shell). Les noms de branches, les empreintes et les chemins sont vérifiés
// avant d'arriver à git : rien de ce qui vient du navigateur n'est passé tel quel comme option.
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RepoBranch, RepoChange, RepoCommit, RepoOverview, RepoReq } from '../shared/protocol.ts';
import { git, isRepo, parseDiff, why } from './git.ts';

export interface RepoResult {
  ok: boolean;
  text?: string;
  overview?: RepoOverview;
  branches?: RepoBranch[];
  commits?: RepoCommit[];
  more?: boolean;
  skip?: number;
  changes?: RepoChange[];
  files?: import('../shared/protocol.ts').DiffFile[];
  body?: string;
  hash?: string;
  path?: string;
  staged?: boolean;
}

const LOG_PAGE = 120;
const RS = '\x1e';
const US = '\x1f';

/** Une seule commande git à la fois par dépôt (sinon : « index.lock » existe déjà). */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(folder: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(folder) ?? Promise.resolve();
  const next = prev.then(job, job);
  queues.set(folder, next.catch(() => {}));
  return next;
}

const fail = (text: string): RepoResult => ({ ok: false, text });

/** Un nom de branche ou de référence sûr : pas d'option déguisée, pas de caractère étrange. */
function safeRef(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= 200 && !s.startsWith('-') && /^[\w./@{}+~^-]+$/.test(s) && !s.includes('..') ? s : null;
}

const safeHash = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{7,40}$/.test(v) ? v : null);

/** Des chemins du dépôt (relatifs, sans « .. »). */
function safePaths(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 500) return null;
  const out: string[] = [];
  for (const p of v) {
    if (typeof p !== 'string' || !p || p.includes('\0') || p.length > 1000) return null;
    const n = path.posix.normalize(p);
    if (n.startsWith('/') || n === '..' || n.startsWith('../')) return null;
    out.push(n);
  }
  return out;
}

/** Un rebase est en cours (il attend que tu règles des conflits). */
async function rebasing(folder: string) {
  for (const d of ['rebase-merge', 'rebase-apply']) {
    const r = await git(folder, ['rev-parse', '--git-path', d]);
    if (r.code === 0 && existsSync(path.resolve(folder, r.out.trim()))) return true;
  }
  return false;
}

async function overview(folder: string): Promise<RepoOverview> {
  const branchR = await git(folder, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const headR = await git(folder, ['rev-parse', '--short', 'HEAD']);
  const upR = await git(folder, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  let ahead = 0, behind = 0;
  if (upR.code === 0) {
    const c = (await git(folder, ['rev-list', '--left-right', '--count', '@{u}...HEAD'])).out.trim().split(/\s+/);
    behind = Number(c[0]) || 0;
    ahead = Number(c[1]) || 0;
  }
  const { changes } = await changesOf(folder);
  let staged = 0, unstaged = 0, untracked = 0, conflicts = 0;
  for (const c of changes) {
    if (c.index === '?' ) { untracked++; continue; }
    if (c.index === 'U' || c.work === 'U' || (c.index === 'A' && c.work === 'A') || (c.index === 'D' && c.work === 'D')) { conflicts++; continue; }
    if (c.index !== ' ') staged++;
    if (c.work !== ' ') unstaged++;
  }
  const remotes = (await git(folder, ['remote'])).out.trim();
  const stashes = (await git(folder, ['stash', 'list'])).out.split('\n').filter(Boolean).length;
  const merging = (await git(folder, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).code === 0 || (await rebasing(folder));
  return {
    branch: branchR.code === 0 ? branchR.out.trim() : null, head: headR.code === 0 ? headR.out.trim() : '',
    upstream: upR.code === 0 ? upR.out.trim() : undefined, ahead, behind, staged, unstaged, untracked, conflicts,
    remote: remotes !== '', stashes, merging,
  };
}

async function changesOf(folder: string): Promise<{ changes: RepoChange[] }> {
  const r = await git(folder, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 20_000);
  const changes: RepoChange[] = [];
  if (r.code !== 0) return { changes };
  const parts = r.out.split('\0');
  for (let i = 0; i < parts.length && changes.length < 2000; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const index = e[0], work = e[1];
    const file = e.slice(3);
    if (index === 'R' || index === 'C') changes.push({ path: file, oldPath: parts[++i], index, work });
    else changes.push({ path: file, index, work });
  }
  return { changes };
}

async function branches(folder: string): Promise<RepoBranch[]> {
  const fmt = ['%(refname)', '%(refname:short)', '%(objectname:short)', '%(upstream:short)', '%(upstream:track,nobracket)', '%(committerdate:unix)', '%(contents:subject)', '%(HEAD)'].join('%1f') + '%1e';
  const r = await git(folder, ['for-each-ref', `--format=${fmt}`, 'refs/heads', 'refs/remotes']);
  const out: RepoBranch[] = [];
  for (const rec of r.out.split(RS)) {
    const f = rec.replace(/^\n/, '').split(US);
    if (f.length < 8) continue;
    const remote = f[0].startsWith('refs/remotes/');
    if (remote && f[0].endsWith('/HEAD')) continue;
    const track = f[4];
    out.push({
      name: f[1], current: f[7].trim() === '*', remote, upstream: f[3] || undefined,
      ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0), behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0), gone: track.includes('gone'),
      hash: f[2], subject: f[6], at: Number(f[5]) * 1000 || 0,
    });
  }
  // les branches locales d'abord (la courante en tête), puis celles de origin
  return out.sort((a, b) => Number(a.remote) - Number(b.remote) || Number(b.current) - Number(a.current) || b.at - a.at);
}

async function logOf(folder: string, req: RepoReq): Promise<RepoResult> {
  const skip = Math.max(0, Math.min(100_000, Math.floor(Number(req.skip) || 0)));
  const args = ['log', '--topo-order', `--max-count=${LOG_PAGE + 1}`, `--skip=${skip}`, `--format=%H${US}%P${US}%an${US}%at${US}%s${US}%D${RS}`];
  if (req.all) args.push('--all');
  else if (req.ref) {
    const ref = safeRef(req.ref);
    if (!ref) return fail('Nom de branche invalide.');
    args.push(ref);
  }
  args.push('--');
  const r = await git(folder, args, 30_000);
  if (r.code !== 0) return r.err.includes('does not have any commits') || r.err.includes('bad default revision') ? { ok: true, commits: [], more: false, skip } : fail(why(r));
  const commits: RepoCommit[] = [];
  for (const rec of r.out.split(RS)) {
    const f = rec.replace(/^\n/, '').split(US);
    if (f.length < 6) continue;
    commits.push({
      hash: f[0], parents: f[1] ? f[1].split(' ') : [], author: f[2], at: Number(f[3]) * 1000, subject: f[4],
      refs: f[5] ? f[5].split(', ').map((x) => x.trim()).filter(Boolean) : [],
    });
  }
  const more = commits.length > LOG_PAGE;
  return { ok: true, commits: commits.slice(0, LOG_PAGE), more, skip };
}

async function untrackedPatch(folder: string, file: string) {
  const r = await git(folder, ['diff', '--no-index', '--no-color', '--', '/dev/null', file]);
  return parseDiff(r.out);
}

/** Exécute une demande du navigateur sur le dépôt du dossier de travail. */
export function repoRequest(folder: string, req: RepoReq): Promise<RepoResult> {
  return serial(folder, () => handle(folder, req));
}

async function handle(folder: string, req: RepoReq): Promise<RepoResult> {
  if (!(await isRepo(folder))) return fail('Ce dossier n’est pas un dépôt git. Lance « git init » pour en faire un.');
  const done = async (text: string): Promise<RepoResult> => ({ ok: true, text, overview: await overview(folder) });
  switch (req.op) {
    case 'overview': return { ok: true, overview: await overview(folder) };
    case 'branches': return { ok: true, branches: await branches(folder), overview: await overview(folder) };
    case 'changes': return { ok: true, ...(await changesOf(folder)), overview: await overview(folder) };
    case 'log': return logOf(folder, req);
    case 'show': {
      const hash = safeHash(req.hash);
      if (!hash) return fail('Commit inconnu.');
      const body = (await git(folder, ['show', '-s', '--format=%B', hash])).out.trim();
      // pour une fusion, on montre ce qu'elle apporte à la première branche
      const r = await git(folder, ['show', '--format=', '--patch', '--no-color', '-M', '-m', '--first-parent', hash], 30_000);
      return r.code === 0 ? { ok: true, hash, body, files: parseDiff(r.out) } : fail(why(r));
    }
    case 'diff': {
      const paths = safePaths([req.path]);
      if (!paths) return fail('Chemin invalide.');
      const file = paths[0];
      if (req.staged) {
        const r = await git(folder, ['diff', '--cached', '--no-color', '-M', '--', file]);
        return { ok: true, path: file, staged: true, files: parseDiff(r.out) };
      }
      const tracked = (await git(folder, ['ls-files', '--error-unmatch', '--', file])).code === 0;
      if (!tracked) return { ok: true, path: file, staged: false, files: await untrackedPatch(folder, file) };
      const r = await git(folder, ['diff', '--no-color', '-M', '--', file]);
      return { ok: true, path: file, staged: false, files: parseDiff(r.out) };
    }
    case 'fetch': {
      const r = await git(folder, ['fetch', '--prune'], 90_000);
      return r.code === 0 ? done('À jour avec le remote.') : fail(why(r));
    }
    case 'pull': {
      const mode = req.mode === 'merge' ? ['--no-rebase', '--no-edit'] : req.mode === 'rebase' ? ['--rebase'] : ['--ff-only'];
      const r = await git(folder, ['pull', ...mode], 120_000);
      if (r.code === 0) return done(/Already up to date|Déjà à jour/i.test(r.out) ? 'Déjà à jour.' : req.mode === 'rebase' ? 'Commits rejoués sur la branche du remote.' : req.mode === 'merge' ? 'Branche du remote fusionnée.' : 'Branche mise à jour.');
      const text = r.out + r.err;
      if (/CONFLICT|conflit/i.test(text)) return { ok: false, text: req.mode === 'rebase' ? 'Conflits pendant le rebase : règle-les dans ton éditeur, puis continue avec git, ou annule.' : 'Conflits : règle-les dans ton éditeur, puis commite. Ou annule la fusion.', overview: await overview(folder) };
      return fail(/ff-only|fast-forward|diverg/i.test(text) ? 'Ta branche et celle du remote ont chacune de nouveaux commits : choisis « Pull + fusion » ou « Pull + rebase ».' : why(r));
    }
    case 'push': {
      const ov = await overview(folder);
      if (!ov.remote) return fail('Pas de remote : ajoute-en un avec « git remote add origin … ».');
      if (!ov.branch) return fail('HEAD détachée : crée une branche avant de pousser.');
      const r = ov.upstream ? await git(folder, ['push'], 120_000) : await git(folder, ['push', '-u', 'origin', ov.branch], 120_000);
      return r.code === 0 ? done(ov.upstream ? 'Poussé.' : `Poussé, et ${ov.branch} suit maintenant origin.`) : fail(why(r));
    }
    case 'checkout': {
      const name = safeRef(req.branch);
      if (!name) return fail('Nom de branche invalide.');
      // une branche de origin : on la suit en local (ou, si elle existe déjà en local, on y va simplement)
      const local = req.remote ? name.replace(/^[^/]+\//, '') : name;
      const exists = (await git(folder, ['rev-parse', '--verify', '--quiet', `refs/heads/${local}`])).code === 0;
      const r = req.remote && !exists ? await git(folder, ['switch', '--track', name]) : await git(folder, ['switch', local]);
      return r.code === 0 ? done(`Sur ${local}.`)
        : fail(/overwritten|would be|local changes|modifications/i.test(r.err) ? 'Des changements locaux gênent : commite-les ou mets-les de côté (stash), puis réessaie.' : why(r));
    }
    case 'new_branch': {
      const name = safeRef(req.name);
      if (!name) return fail('Nom de branche invalide.');
      if ((await git(folder, ['check-ref-format', '--branch', name])).code !== 0) return fail(`« ${name} » n’est pas un nom de branche valide pour git.`);
      const from = req.from ? safeRef(req.from) : null;
      if (req.from && !from) return fail('Point de départ invalide.');
      const r = await git(folder, ['switch', '-c', name, ...(from ? [from] : [])]);
      return r.code === 0 ? done(`Branche ${name} créée.`) : fail(why(r));
    }
    case 'delete_branch': {
      const name = safeRef(req.name);
      if (!name) return fail('Nom de branche invalide.');
      const ov = await overview(folder);
      if (ov.branch === name) return fail('Tu es sur cette branche : change de branche avant de la supprimer.');
      const r = await git(folder, ['branch', req.force ? '-D' : '-d', name]);
      return r.code === 0 ? done(`Branche ${name} supprimée.`)
        : fail(/not fully merged/i.test(r.err) ? `${name} a des commits qui ne sont nulle part ailleurs. Supprime-la quand même si tu es sûr.` : why(r));
    }
    case 'merge': {
      const name = safeRef(req.branch);
      if (!name) return fail('Nom de branche invalide.');
      const r = await git(folder, ['merge', '--no-edit', name], 60_000);
      if (r.code === 0) return done(/Already up to date|Déjà à jour/i.test(r.out) ? 'Déjà à jour.' : `${name} fusionnée.`);
      return { ok: false, text: /CONFLICT|conflit/i.test(r.out + r.err) ? 'Conflits : règle-les dans ton éditeur, puis commite. Ou annule la fusion.' : why(r), overview: await overview(folder) };
    }
    case 'merge_abort': {
      const rebase = await rebasing(folder);
      const r = await git(folder, [rebase ? 'rebase' : 'merge', '--abort']);
      return r.code === 0 ? done(rebase ? 'Rebase annulé.' : 'Fusion annulée.') : fail(why(r));
    }
    case 'stage': {
      if (!req.paths) { const r = await git(folder, ['add', '-A']); return r.code === 0 ? done('Tout est prêt à commiter.') : fail(why(r)); }
      const paths = safePaths(req.paths);
      if (!paths?.length) return fail('Chemin invalide.');
      const r = await git(folder, ['add', '--', ...paths]);
      return r.code === 0 ? done('') : fail(why(r));
    }
    case 'unstage': {
      const paths = req.paths ? safePaths(req.paths) : ['.'];
      if (!paths?.length) return fail('Chemin invalide.');
      let r = await git(folder, ['restore', '--staged', '--', ...paths]);
      // premier commit : pas encore de HEAD vers lequel revenir
      if (r.code !== 0) r = await git(folder, ['rm', '--cached', '-r', '-q', '--', ...paths]);
      return r.code === 0 ? done('') : fail(why(r));
    }
    case 'discard': {
      const paths = safePaths(req.paths);
      if (!paths?.length) return fail('Chemin invalide.');
      for (const p of paths) {
        const tracked = (await git(folder, ['ls-files', '--error-unmatch', '--', p])).code === 0;
        const r = tracked ? await git(folder, ['restore', '--source=HEAD', '--staged', '--worktree', '--', p]) : await git(folder, ['clean', '-f', '-d', '--', p]);
        if (r.code !== 0) return fail(why(r));
      }
      return done('Changements annulés.');
    }
    case 'commit': {
      const message = typeof req.message === 'string' ? req.message.trim().slice(0, 10_000) : '';
      if (!message) return fail('Écris un message de commit.');
      if (req.all_changes) { const a = await git(folder, ['add', '-A']); if (a.code !== 0) return fail(why(a)); }
      const ov = await overview(folder);
      if (ov.conflicts) return fail('Il reste des conflits : règle-les avant de commiter.');
      if (!ov.staged && !req.all_changes) return fail('Rien n’est prêt à commiter : ajoute des fichiers avec « + ».');
      const r = await git(folder, ['commit', '-m', message], 60_000);
      if (r.code !== 0) return fail(/user\.(name|email)|identity|tell me who you are/i.test(r.err + r.out) ? 'git ne sait pas qui tu es : configure « git config user.name » et « user.email ».' : why(r));
      return done('Commit fait.');
    }
    case 'stash': {
      const r = req.pop ? await git(folder, ['stash', 'pop']) : await git(folder, ['stash', 'push', '--include-untracked', '-m', 'Bureau des agents']);
      if (r.code !== 0) return fail(why(r));
      return done(req.pop ? 'Changements remis.' : /No local changes/i.test(r.out) ? 'Rien à mettre de côté.' : 'Changements mis de côté.');
    }
    default: return fail('Action inconnue.');
  }
}
