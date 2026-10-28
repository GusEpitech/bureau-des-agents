// Le mode Git : le dépôt du dossier de travail, comme dans un IDE. Les changements (prêts à commiter, modifiés,
// commit), l'historique avec son graphe, les branches (changer, créer, fusionner, supprimer), pull, push, fetch.
// Le diff de la mission (la fin de la séance de l'équipe) est la quatrième vue.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { RepoBranch, RepoChange, RepoCommit, RepoOp, RepoReq } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { useOffice, type GitView } from '../state/store.ts';
import { DiffSection, FileRow, Patch } from './Diff.tsx';
import { tidy } from './tidy.ts';
import { Px } from './Px.tsx';

const READS = new Set<RepoOp>(['overview', 'branches', 'log', 'show', 'changes', 'diff']);

/** Envoie une demande au dépôt ; les actions qui le modifient allument l'indicateur « en cours ». */
function useAsk() {
  const send = useOffice((s) => s.send);
  return useCallback((req: RepoReq) => {
    if (!READS.has(req.op)) useOffice.setState((s) => ({ repo: { ...s.repo, busy: req.op, result: null } }));
    send({ t: 'repo', ...req });
  }, [send]);
}

const WHEN = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
/** « il y a 5 minutes », « hier », « 3 mars » */
function ago(at: number) {
  const s = Math.round((at - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 60) return 'à l’instant';
  if (a < 3600) return WHEN.format(Math.round(s / 60), 'minute');
  if (a < 86400) return WHEN.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 7) return WHEN.format(Math.round(s / 86400), 'day');
  return new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: a > 86400 * 300 ? 'numeric' : undefined });
}

// ── La barre du haut : la branche, pull, push, fetch, et où en est le dépôt ──
function Toolbar({ ask, locked }: { ask: (r: RepoReq) => void; locked: boolean }) {
  const ov = useOffice((s) => s.repo.overview);
  const busy = useOffice((s) => s.repo.busy);
  const working = useOffice((s) => s.busySince !== null);
  const result = useOffice((s) => s.repo.result);
  const go = (view: GitView) => useOffice.setState({ gitView: view });
  if (!ov) return <p className="small muted">Je regarde le dépôt…</p>;
  const off = !!busy;
  return (
    <div className="repo-bar">
      <div className="repo-row">
        <button className="repo-branch" title="Voir et changer de branche" onClick={() => { sfx('click'); go('branches'); }}>
          <Px e="🌿" /> <code>{ov.branch ?? (ov.merging ? 'rebase en cours' : `HEAD détachée (${ov.head})`)}</code> <span aria-hidden="true">▾</span>
        </button>
        <span className="grow" />
        <button className="btn small" disabled={off || !ov.remote} title="git fetch : récupère les nouveautés du remote, sans rien changer chez toi" onClick={() => { sfx('click'); ask({ op: 'fetch' }); }}>
          {busy === 'fetch' ? '…' : '⟳ Fetch'}
        </button>
        {ov.ahead > 0 && ov.behind > 0 ? (
          <>
            <button className="btn small" disabled={off || locked} title={`git pull : fusionne ${ov.upstream} dans ta branche (crée un commit de fusion)`} onClick={() => { sfx('click'); ask({ op: 'pull', mode: 'merge' }); }}>
              {busy === 'pull' ? '…' : <>↓ Pull + fusion<b className="repo-n">{ov.behind}</b></>}
            </button>
            <button className="btn small" disabled={off || locked} title={`git pull --rebase : rejoue tes commits par-dessus ${ov.upstream} (historique linéaire)`} onClick={() => { sfx('click'); ask({ op: 'pull', mode: 'rebase' }); }}>↓ Pull + rebase</button>
          </>
        ) : (
          <button className="btn small" disabled={off || locked || !ov.upstream} title={ov.upstream ? `git pull --ff-only depuis ${ov.upstream}` : 'Cette branche ne suit aucune branche du remote'} onClick={() => { sfx('click'); ask({ op: 'pull' }); }}>
            {busy === 'pull' ? '…' : <>↓ Pull{ov.behind > 0 && <b className="repo-n">{ov.behind}</b>}</>}
          </button>
        )}
        <button className={`btn small ${ov.ahead > 0 || (!ov.upstream && ov.remote && ov.branch) ? 'primary' : ''}`} disabled={off || !ov.remote || !ov.branch} title={ov.upstream ? `git push vers ${ov.upstream}` : 'git push -u origin : crée la branche sur le remote'} onClick={() => { sfx('click'); ask({ op: 'push' }); }}>
          {busy === 'push' ? '…' : <>↑ Push{ov.ahead > 0 && <b className="repo-n">{ov.ahead}</b>}</>}
        </button>
      </div>
      <div className="repo-row small muted">
        {ov.upstream ? <span title="La branche du remote que celle-ci suit">suit <code>{ov.upstream}</code></span> : <span>{ov.remote ? 'pas encore sur le remote' : 'pas de remote'}</span>}
        {ov.staged > 0 && <span className="repo-chip ok">{ov.staged} prêt{ov.staged > 1 ? 's' : ''}</span>}
        {ov.unstaged + ov.untracked > 0 && <span className="repo-chip">{ov.unstaged + ov.untracked} modifié{ov.unstaged + ov.untracked > 1 ? 's' : ''}</span>}
        {ov.conflicts > 0 && <span className="repo-chip ko">{ov.conflicts} conflit{ov.conflicts > 1 ? 's' : ''}</span>}
        {ov.stashes > 0 && <span className="repo-chip" title="Changements mis de côté (git stash)">{ov.stashes} en réserve</span>}
        {ov.staged + ov.unstaged + ov.untracked + ov.conflicts === 0 && <span className="repo-chip ok">propre</span>}
      </div>
      {ov.merging && (
        <div className="repo-banner">
          <span><Px e="⚠️" /> Une fusion (ou un rebase) est en cours{ov.conflicts ? ' : règle les conflits dans ton éditeur, puis commite.' : ' : termine-la avec git, ou annule.'}</span>
          <button className="btn small ghost" disabled={off} onClick={() => ask({ op: 'merge_abort' })}>Annuler</button>
        </div>
      )}
      {working && <p className="small muted">L’équipe travaille dans ce dépôt : changer de branche, pull et fusion attendent qu’elle ait fini.</p>}
      {result && !result.ok && <p className="small git-result ko"><Px e="⚠️" /> {tidy(result.text)}</p>}
      {result?.ok && result.text && <p className="small git-result ok">✓ {tidy(result.text)}</p>}
    </div>
  );
}

// ── Les changements ──
const LETTER: Record<string, [string, string]> = {
  M: ['M', 'Modifié'], T: ['M', 'Type changé'], A: ['A', 'Ajouté'], D: ['D', 'Supprimé'], R: ['R', 'Renommé'], C: ['C', 'Copié'], '?': ['N', 'Nouveau (pas encore suivi par git)'], U: ['!', 'Conflit'],
};
const isConflict = (c: RepoChange) => c.index === 'U' || c.work === 'U' || (c.index === 'A' && c.work === 'A') || (c.index === 'D' && c.work === 'D');

function ChangeRow({ c, staged, ask, locked }: { c: RepoChange; staged: boolean; ask: (r: RepoReq) => void; locked: boolean }) {
  const diffs = useOffice((s) => s.repo.diffs);
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const key = `${staged ? 's' : 'w'}:${c.path}`;
  const state = isConflict(c) ? 'U' : staged ? c.index : c.work === ' ' ? c.index : c.work;
  const [letter, label] = LETTER[state] ?? ['M', 'Modifié'];
  const toggle = () => { if (!open) ask({ op: 'diff', path: c.path, staged }); setOpen(!open); };
  // le diff ouvert se met à jour quand le fichier change
  const sig = useOffice((s) => s.repo.changes);
  useEffect(() => { if (open && sig) ask({ op: 'diff', path: c.path, staged }); }, [sig]);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 3500); return () => clearTimeout(t); }, [sure]);
  const file = diffs[key]?.[0];
  return (
    <div className={`repo-file ${open ? 'open' : ''}`}>
      <div className="repo-file-head">
        <button className="repo-file-open" onClick={toggle} title={label}>
          <span className={`diff-st ${letter === 'A' || letter === 'N' ? 'added' : letter === 'D' ? 'deleted' : letter === 'R' ? 'renamed' : letter === '!' ? 'conflict' : 'modified'}`}>{letter}</span>
          <span className="diff-path">{c.oldPath ? <>{c.oldPath} → {c.path}</> : c.path}</span>
        </button>
        {!staged && <button className={`icon-btn ${sure ? 'danger' : ''}`} disabled={locked} title={sure ? 'Clique encore : ce fichier revient à son dernier commit' : 'Annuler les changements de ce fichier'} onClick={() => { if (sure) { setSure(false); ask({ op: 'discard', paths: [c.path] }); } else { sfx('click'); setSure(true); } }}>{sure ? 'Sûr ?' : '↶'}</button>}
        <button className="icon-btn" title={staged ? 'Retirer des fichiers prêts à commiter' : 'Ajouter aux fichiers prêts à commiter (git add)'} onClick={() => { sfx('click'); ask(staged ? { op: 'unstage', paths: [c.path] } : { op: 'stage', paths: [c.path] }); }}>{staged ? '−' : '+'}</button>
      </div>
      {open && (file ? <Patch f={file} /> : <p className="small muted diff-empty">Je calcule le diff…</p>)}
    </div>
  );
}

function ChangesView({ ask, locked }: { ask: (r: RepoReq) => void; locked: boolean }) {
  const changes = useOffice((s) => s.repo.changes);
  const ov = useOffice((s) => s.repo.overview);
  const busy = useOffice((s) => s.repo.busy);
  const result = useOffice((s) => s.repo.result);
  const [msg, setMsg] = useState('');
  const staged = useMemo(() => (changes ?? []).filter((c) => !isConflict(c) && c.index !== ' ' && c.index !== '?'), [changes]);
  const work = useMemo(() => (changes ?? []).filter((c) => isConflict(c) || c.index === '?' || c.work !== ' '), [changes]);
  // après un commit réussi, la zone se vide
  useEffect(() => { if (result?.ok && result.op === 'commit') setMsg(''); }, [result]);
  const commit = (all: boolean) => { if (msg.trim()) { sfx('click'); ask({ op: 'commit', message: msg, all_changes: all }); } };
  if (!changes) return <p className="small muted">Je regarde les changements…</p>;
  return (
    <div className="repo-changes">
      {changes.length === 0 && <p className="small muted">Rien à commiter : le dossier est propre. <Px e="✨" /></p>}
      {staged.length > 0 && (
        <section>
          <div className="repo-sec"><b>Prêts à commiter <span className="count">{staged.length}</span></b><button className="btn small ghost" onClick={() => ask({ op: 'unstage' })}>Tout retirer</button></div>
          {staged.map((c) => <ChangeRow key={`s${c.path}`} c={c} staged ask={ask} locked={locked} />)}
        </section>
      )}
      {work.length > 0 && (
        <section>
          <div className="repo-sec"><b>Modifiés <span className="count">{work.length}</span></b><button className="btn small ghost" onClick={() => ask({ op: 'stage' })}>Tout ajouter</button></div>
          {work.map((c) => <ChangeRow key={`w${c.path}`} c={c} staged={false} ask={ask} locked={locked} />)}
        </section>
      )}
      {(staged.length > 0 || work.length > 0) && (
        <div className="repo-commit">
          <textarea rows={3} value={msg} placeholder="Le message de commit (Ctrl+Entrée pour commiter)" onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(staged.length === 0); } }} />
          <div className="row">
            <button className="btn primary" disabled={!!busy || !msg.trim() || staged.length === 0} onClick={() => commit(false)}>{busy === 'commit' ? 'Commit…' : `Commiter${staged.length ? ` (${staged.length})` : ''}`}</button>
            {staged.length === 0 && work.length > 0 && <button className="btn" disabled={!!busy || !msg.trim()} title="git add -A, puis commit" onClick={() => commit(true)}>Tout ajouter et commiter</button>}
          </div>
        </div>
      )}
      <div className="row repo-stash">
        {(staged.length > 0 || work.length > 0) && <button className="btn small ghost" disabled={!!busy || locked} title="git stash : met tes changements de côté pour pouvoir changer de branche" onClick={() => ask({ op: 'stash' })}>Mettre de côté</button>}
        {!!ov && ov.stashes > 0 && <button className="btn small ghost" disabled={!!busy || locked} title="git stash pop : remet le dernier changement mis de côté" onClick={() => ask({ op: 'stash', pop: true })}>Remettre ({ov.stashes})</button>}
      </div>
    </div>
  );
}

// ── L'historique et son graphe ──
const LANE_COLORS = ['#2ed3b7', '#ff8a3d', '#a98bff', '#4fb3ff', '#ff6fa8', '#ffd166', '#3ddc97'];
const LANE_W = 12;
const ROW_H = 28;

interface GraphRow { c: RepoCommit; lane: number; before: (string | null)[]; after: (string | null)[] }

/** Place chaque commit sur une voie : une branche garde sa voie jusqu'à ce qu'elle rejoigne une autre. */
function layoutGraph(commits: RepoCommit[]): { rows: GraphRow[]; width: number } {
  let lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let max = 1;
  for (const c of commits) {
    const before = lanes.slice();
    let lane = lanes.indexOf(c.hash);
    if (lane === -1) { lane = lanes.indexOf(null); if (lane === -1) { lane = lanes.length; lanes.push(null); } }
    // le commit arrive : toutes les voies qui l'attendaient se ferment
    lanes = lanes.map((h) => (h === c.hash ? null : h));
    if (c.parents.length) {
      const first = c.parents[0];
      if (lanes.indexOf(first) === -1) lanes[lane] = first;
      for (const p of c.parents.slice(1)) {
        if (lanes.indexOf(p) !== -1) continue;
        let free = lanes.indexOf(null);
        if (free === -1) { free = lanes.length; lanes.push(null); }
        lanes[free] = p;
      }
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    const after = lanes.slice();
    max = Math.max(max, before.length, after.length, lane + 1);
    rows.push({ c, lane, before, after });
  }
  return { rows, width: Math.min(max, 9) * LANE_W + 6 };
}

function GraphCell({ row, width }: { row: GraphRow; width: number }) {
  const x = (i: number) => Math.min(i, 8) * LANE_W + 9;
  const mid = ROW_H / 2;
  const col = (i: number) => LANE_COLORS[i % LANE_COLORS.length];
  const lines: ReactElement[] = [];
  row.before.forEach((h, i) => {
    if (h === null) return;
    if (h === row.c.hash) lines.push(<line key={`in${i}`} x1={x(i)} y1={0} x2={x(row.lane)} y2={mid} stroke={col(i)} strokeWidth={2} />);
    else { const j = row.after.indexOf(h); lines.push(<line key={`v${i}`} x1={x(i)} y1={0} x2={x(j === -1 ? i : j)} y2={ROW_H} stroke={col(i)} strokeWidth={2} />); }
  });
  row.c.parents.forEach((p, k) => {
    const j = row.after.indexOf(p);
    if (j === -1) return;
    lines.push(<line key={`out${k}`} x1={x(row.lane)} y1={mid} x2={x(j)} y2={ROW_H} stroke={col(j)} strokeWidth={2} />);
  });
  const merge = row.c.parents.length > 1;
  return (
    <svg className="repo-graph" width={width} height={ROW_H} aria-hidden="true">
      {lines}
      <circle cx={x(row.lane)} cy={mid} r={merge ? 3.5 : 4.5} fill={merge ? '#15121d' : col(row.lane)} stroke={col(row.lane)} strokeWidth={2} />
    </svg>
  );
}

function RefChip({ r }: { r: string }) {
  if (r.startsWith('HEAD -> ')) return <span className="repo-ref head" title="Tu es ici">{r.slice(8)}</span>;
  if (r === 'HEAD') return <span className="repo-ref head">HEAD</span>;
  if (r.startsWith('tag: ')) return <span className="repo-ref gittag"><Px e="🏷" /> {r.slice(5)}</span>;
  if (r.includes('/')) return <span className="repo-ref remote">{r}</span>;
  return <span className="repo-ref local">{r}</span>;
}

function HistoryView({ ask }: { ask: (r: RepoReq) => void }) {
  const commits = useOffice((s) => s.repo.commits);
  const more = useOffice((s) => s.repo.more);
  const shown = useOffice((s) => s.repo.shown);
  const [all, setAll] = useState(true);
  const [openHash, setOpenHash] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());
  const graph = useMemo(() => layoutGraph(commits ?? []), [commits]);
  useEffect(() => { ask({ op: 'log', all }); }, [all]);
  const toggle = (hash: string) => {
    if (openHash === hash) { setOpenHash(null); return; }
    setOpenHash(hash);
    setOpenFiles(new Set());
    ask({ op: 'show', hash });
  };
  if (!commits) return <p className="small muted">Je lis l’historique…</p>;
  return (
    <div className="repo-history">
      <div className="repo-sec">
        <label className="check small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Toutes les branches</label>
        <span className="grow" />
        <button className="btn small ghost" title="Rafraîchir" onClick={() => ask({ op: 'log', all })}>↻</button>
      </div>
      {commits.length === 0 && <p className="small muted">Pas encore de commit.</p>}
      {graph.rows.map((row) => {
        const c = row.c;
        const open = openHash === c.hash;
        return (
          <div key={c.hash} className={`repo-commit-row ${open ? 'open' : ''}`}>
            <button className="repo-commit-head" onClick={() => toggle(c.hash)}>
              <GraphCell row={row} width={graph.width} />
              <span className="repo-subject">
                {c.refs.map((r) => <RefChip key={r} r={r} />)}
                <span className="repo-msg">{c.subject}</span>
              </span>
              <span className="repo-meta" title={new Date(c.at).toLocaleString('fr-FR')}>{c.author} · {ago(c.at)}</span>
              <code className="repo-hash">{c.hash.slice(0, 7)}</code>
            </button>
            {open && (
              <div className="repo-commit-detail">
                {shown?.hash === c.hash ? (
                  <>
                    {shown.body && <pre className="repo-body">{tidy(shown.body)}</pre>}
                    <p className="small muted">{shown.files.length} fichier{shown.files.length > 1 ? 's' : ''} · <code>{c.hash}</code></p>
                    {shown.files.map((f) => <FileRow key={f.path} f={f} open={openFiles.has(f.path)} onToggle={() => setOpenFiles((o) => { const n = new Set(o); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n; })} />)}
                  </>
                ) : <p className="small muted">Je charge le commit…</p>}
              </div>
            )}
          </div>
        );
      })}
      {more && <button className="btn small" onClick={() => ask({ op: 'log', all, skip: commits.length })}>Charger la suite</button>}
    </div>
  );
}

// ── Les branches ──
function BranchRow({ b, current, ask, locked }: { b: RepoBranch; current: string | null; ask: (r: RepoReq) => void; locked: boolean }) {
  const busy = useOffice((s) => s.repo.busy);
  const result = useOffice((s) => s.repo.result);
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 3500); return () => clearTimeout(t); }, [sure]);
  const off = !!busy || locked;
  const unmerged = result?.op === 'delete_branch' && !result.ok && result.text.includes(b.name) && result.text.includes('quand même');
  return (
    <div className={`repo-branch-row ${b.current ? 'current' : ''}`}>
      <div className="repo-branch-id">
        <div className="repo-branch-top">
          <b className="repo-branch-name" title={b.name}>{b.current && <span title="Branche actuelle">✓ </span>}<code>{b.name}</code></b>
          {b.ahead > 0 && <span className="repo-chip ok" title="Commits pas encore poussés">↑{b.ahead}</span>}
          {b.behind > 0 && <span className="repo-chip" title="Commits à récupérer">↓{b.behind}</span>}
          {b.gone && <span className="repo-chip ko" title="La branche du remote n'existe plus">plus sur le remote</span>}
        </div>
        <span className="small muted repo-branch-sub" title={tidy(b.subject)}>{tidy(b.subject)} · {ago(b.at)}</span>
      </div>
      <div className="repo-branch-actions">
        {!b.current && <button className="btn small" disabled={off} onClick={() => { sfx('click'); ask(b.remote ? { op: 'checkout', branch: b.name, remote: true } : { op: 'checkout', branch: b.name }); }}>{b.remote ? 'Récupérer' : 'Aller sur'}</button>}
        {!b.current && !b.remote && current && <button className="btn small ghost" disabled={off} title={`git merge ${b.name} dans ${current}`} onClick={() => { sfx('click'); ask({ op: 'merge', branch: b.name }); }}>Fusionner</button>}
        {!b.current && !b.remote && (
          <button className={`btn small ${sure || unmerged ? 'danger' : 'ghost'}`} disabled={off}
            onClick={() => { if (sure || unmerged) { setSure(false); ask({ op: 'delete_branch', name: b.name, force: unmerged }); } else { sfx('click'); setSure(true); } }}>
            {unmerged ? 'Forcer la suppression' : sure ? 'Sûr ?' : 'Supprimer'}
          </button>
        )}
      </div>
    </div>
  );
}

function BranchesView({ ask, locked }: { ask: (r: RepoReq) => void; locked: boolean }) {
  const branches = useOffice((s) => s.repo.branches);
  const ov = useOffice((s) => s.repo.overview);
  const busy = useOffice((s) => s.repo.busy);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const result = useOffice((s) => s.repo.result);
  useEffect(() => { if (result?.ok && result.op === 'new_branch') setName(''); }, [result]);
  const list = useMemo(() => (branches ?? []).filter((b) => !filter || b.name.toLowerCase().includes(filter.toLowerCase())), [branches, filter]);
  const local = list.filter((b) => !b.remote);
  const localNames = new Set((branches ?? []).filter((b) => !b.remote).map((b) => b.name));
  // une branche de origin qu'on n'a pas encore en local
  const remote = list.filter((b) => b.remote && !localNames.has(b.name.replace(/^[^/]+\//, '')));
  const create = () => { if (name.trim()) { sfx('click'); ask({ op: 'new_branch', name: name.trim() }); } };
  if (!branches) return <p className="small muted">Je liste les branches…</p>;
  return (
    <div className="repo-branches">
      <div className="repo-newbranch">
        <input value={name} placeholder={`Nouvelle branche à partir de ${ov?.branch ?? 'HEAD'}`} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
        <button className="btn primary" disabled={!name.trim() || !!busy || locked} onClick={create}>Créer</button>
      </div>
      {(branches.length > 8) && <input className="repo-filter" value={filter} placeholder="Filtrer les branches…" onChange={(e) => setFilter(e.target.value)} />}
      <div className="repo-sec"><b>Locales <span className="count">{local.length}</span></b></div>
      {local.map((b) => <BranchRow key={b.name} b={b} current={ov?.branch ?? null} ask={ask} locked={locked} />)}
      {remote.length > 0 && <div className="repo-sec"><b>Sur le remote <span className="count">{remote.length}</span></b></div>}
      {remote.map((b) => <BranchRow key={b.name} b={b} current={ov?.branch ?? null} ask={ask} locked={locked} />)}
    </div>
  );
}

// ── L'onglet ──
export function GitSection() {
  const workdir = useOffice((s) => s.settings.workdir);
  const mission = useOffice((s) => s.mission);
  const view = useOffice((s) => s.gitView);
  const working = useOffice((s) => s.busySince !== null);
  const connection = useOffice((s) => s.connection);
  const ask = useAsk();
  // ce qui doit rafraîchir le dépôt : un fichier touché, la fin d'un tour, une action réussie
  const filesSig = useOffice((s) => s.files.reduce((n, f) => n + f.at, s.files.length));
  const endAt = useOffice((s) => s.final?.at ?? 0);
  const resultAt = useOffice((s) => s.repo.result?.at ?? 0);
  const hasMission = !!mission?.project;
  const current: GitView = view === 'mission' && !hasMission ? 'changes' : view;
  const viewRef = useRef(current);
  viewRef.current = current;

  const refresh = useCallback(() => {
    ask({ op: 'overview' });
    const v = viewRef.current;
    if (v === 'changes') ask({ op: 'changes' });
    else if (v === 'branches') ask({ op: 'branches' });
  }, [ask]);

  useEffect(() => {
    if (!workdir || connection !== 'live') return;
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [workdir, connection, current, filesSig, endAt, resultAt, refresh]);
  // comme dans un IDE : en revenant sur la fenêtre, le dépôt se met à jour (tu viens peut-être de committer ailleurs)
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', on);
    window.addEventListener('focus', on);
    return () => { document.removeEventListener('visibilitychange', on); window.removeEventListener('focus', on); };
  }, [refresh]);
  // après une action qui change l'historique (commit, pull, fusion…), la liste se recharge
  useEffect(() => {
    if (current === 'history' && resultAt) ask({ op: 'log', all: true });
  }, [resultAt]);

  if (!workdir) return <section className="card"><p className="small muted">Choisis un dossier de projet (sous la zone de saisie) pour voir son dépôt git.</p></section>;
  if (connection !== 'live') return <section className="card"><p className="small muted">Relie le bureau à Claude Code (npm start) pour voir le dépôt.</p></section>;
  const tabs: [GitView, string][] = [['changes', 'Changements'], ['history', 'Historique'], ['branches', 'Branches']];
  if (hasMission) tabs.push(['mission', 'Mission']);
  return (
    <section className="card repo-card">
      <Toolbar ask={ask} locked={working} />
      <div className="seg repo-tabs">
        {tabs.map(([v, label]) => <button key={v} className={current === v ? 'on' : ''} onClick={() => { sfx('click'); useOffice.setState({ gitView: v }); }}>{label}</button>)}
      </div>
      {current === 'changes' && <ChangesView ask={ask} locked={working} />}
      {current === 'history' && <HistoryView ask={ask} />}
      {current === 'branches' && <BranchesView ask={ask} locked={working} />}
      {current === 'mission' && <DiffSection />}
    </section>
  );
}
