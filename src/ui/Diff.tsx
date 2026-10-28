// Mode projet : le diff de la mission (ce que l'équipe a changé, comparé à la branche de départ)
// et les actions git de la fin : commiter, pousser et ouvrir une PR, revenir sur la base, supprimer la branche.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { DiffFile, GitAction } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { useOffice } from '../state/store.ts';
import { tidy } from './tidy.ts';
import { Px } from './Px.tsx';

const STATUS: Record<DiffFile['status'], [string, string]> = {
  added: ['A', 'Ajouté'], modified: ['M', 'Modifié'], deleted: ['D', 'Supprimé'], renamed: ['R', 'Renommé'],
};

/** Le message de commit proposé par Max : le dernier bloc ```commit de la conversation. */
function useSuggestedMessage() {
  const chat = useOffice((s) => s.chat);
  const title = useOffice((s) => s.mission?.title ?? '');
  return useMemo(() => {
    for (let i = chat.length - 1; i >= 0; i--) {
      const m = chat[i];
      if (m.kind !== 'chef' && m.kind !== 'final') continue;
      const blocks = [...m.text.matchAll(/```commit[^\n]*\n([\s\S]*?)```/g)];
      if (blocks.length) return blocks[blocks.length - 1][1].trim();
    }
    return title.replace(/…$/, '');
  }, [chat, title]);
}

export const Patch = memo(function Patch({ f }: { f: DiffFile }) {
  if (f.binary) return <p className="small muted diff-empty">Fichier binaire : pas d’aperçu.</p>;
  if (!f.patch) return <p className="small muted diff-empty">{f.truncated ? 'Trop gros pour être affiché ici.' : 'Pas de changement de contenu.'}</p>;
  const lines = f.patch.split('\n');
  return (
    <pre className="diff-patch">
      {lines.map((l, i) => {
        const cls = l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('\\') ? 'meta' : 'ctx';
        return <span key={i} className={`dl ${cls}`}>{tidy(l) || ' '}{'\n'}</span>;
      })}
      {f.truncated && <span className="dl meta">… (coupé : le fichier est trop gros)</span>}
    </pre>
  );
});

export function FileRow({ f, open, onToggle }: { f: DiffFile; open: boolean; onToggle: () => void }) {
  const [letter, label] = STATUS[f.status];
  return (
    <div className={`diff-file ${open ? 'open' : ''}`}>
      <button className="diff-file-head" onClick={onToggle} title={label}>
        <span className={`diff-st ${f.status}`}>{letter}</span>
        <span className="diff-path">{f.oldPath ? <>{f.oldPath} → {f.path}</> : f.path}</span>
        <span className="diff-count"><i className="plus">+{f.additions}</i> <i className="minus">−{f.deletions}</i></span>
        <span className="diff-chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && <Patch f={f} />}
    </div>
  );
}

/** Où en est le dépôt, en une ligne : la branche, et ce qu'il reste à faire. */
function GitState() {
  const git = useOffice((s) => s.git);
  if (!git) return <p className="small muted">Je regarde le dépôt…</p>;
  const st = git.status;
  if (!st) return <p className="small muted">{git.text ?? 'Pas de dépôt git.'}</p>;
  const todo = st.dirty ? ['commit', 'À commiter'] : st.branchExists && st.ahead > 0 ? ['push', `${st.ahead} commit${st.ahead > 1 ? 's' : ''} à pousser`] : ['ok', 'À jour'];
  return (
    <div className="git-state">
      <span className="git-branch" title="La branche actuelle du projet"><Px e="🌿" /> <code>{st.branch ?? 'HEAD détachée'}</code></span>
      {st.base && st.branch !== st.base && <span className="muted small">depuis <code>{st.base}</code></span>}
      <span className={`git-chip ${todo[0]}`}>{todo[1]}</span>
      {st.missionBranch && !st.onMission && <span className="warn small">pas sur la branche de la mission</span>}
    </div>
  );
}

/** Le bas du diff : la prochaine étape (commiter, puis pousser), et les autres actions en discret. */
function GitDock() {
  const mission = useOffice((s) => s.mission);
  const git = useOffice((s) => s.git);
  const busy = useOffice((s) => s.gitBusy);
  const result = useOffice((s) => s.gitResult);
  const working = useOffice((s) => s.busySince !== null);
  const send = useOffice((s) => s.send);
  const suggested = useSuggestedMessage();
  const [msg, setMsg] = useState(suggested);
  const edited = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // la proposition de Max remplit la zone, tant que tu n'y as pas touché
  useEffect(() => { if (!edited.current) setMsg(suggested); }, [suggested]);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);
  // après un commit réussi, la zone repart de la prochaine proposition
  useEffect(() => { if (result?.ok && result.action === 'commit') edited.current = false; }, [result]);

  const st = git?.status;
  if (!mission || !st) return null;
  const act = (action: GitAction, message?: string) => {
    sfx('click');
    useOffice.setState({ gitBusy: action, gitResult: null });
    send({ t: 'git', missionId: mission.id, action, message });
  };
  const locked = !!busy || working;
  const canPush = st.branchExists && st.ahead > 0 && st.remote;
  // une seule action mise en avant : commiter d'abord, pousser ensuite
  const next: 'commit' | 'push' | null = st.onMission && st.dirty ? 'commit' : canPush ? 'push' : null;
  const more = (st.base && st.branch !== st.base) || (st.branchExists && !st.onMission);

  return (
    <div className="git-dock">
      {st.onMission && (st.dirty || next === 'commit') && (
        <div className="git-step">
          <b>1 · Commite</b>
          <div className="git-commit">
            <textarea rows={2} value={msg} placeholder="Le message de commit" onChange={(e) => { edited.current = true; setMsg(e.target.value); }} />
            <button className="btn primary" disabled={locked || !st.dirty || !msg.trim()} onClick={() => act('commit', msg)}>
              {busy === 'commit' ? 'Commit…' : 'Commiter'}
            </button>
          </div>
        </div>
      )}
      {st.branchExists && (
        <div className="git-step">
          <b>{st.dirty ? '2 · Pousse' : 'Pousse'}</b>
          <button className={`btn ${next === 'push' ? 'primary' : ''}`} disabled={locked || !canPush}
            title={!st.remote ? 'Pas de remote « origin »' : st.ahead === 0 ? 'Commite d’abord' : st.gh ? 'git push, puis gh pr create' : 'git push (installe gh pour ouvrir la PR toute seule)'}
            onClick={() => act('push')}>
            {busy === 'push' ? 'Envoi…' : st.gh ? 'Pousser et ouvrir une PR' : 'Pousser'}
          </button>
          {!canPush && <span className="small muted">{!st.remote ? 'Pas de remote « origin ».' : st.dirty ? 'Commite d’abord.' : 'Rien à pousser.'}</span>}
        </div>
      )}
      {more && (
        <div className="row git-more">
          {st.base && st.branch !== st.base && (
            <button className="btn small ghost" disabled={locked || st.dirty} title={st.dirty ? 'Commite d’abord tes changements' : `git switch ${st.base}`} onClick={() => act('switch_base')}>
              {busy === 'switch_base' ? '…' : `Revenir sur ${st.base}`}
            </button>
          )}
          {st.branchExists && !st.onMission && (
            <button className={`btn small ${confirmDelete ? 'danger' : 'ghost'}`} disabled={locked}
              onClick={() => { if (confirmDelete) { setConfirmDelete(false); act('delete_branch'); } else { sfx('click'); setConfirmDelete(true); } }}>
              {busy === 'delete_branch' ? '…' : confirmDelete ? 'Sûr ? Clique encore pour supprimer' : 'Supprimer la branche'}
            </button>
          )}
        </div>
      )}
      {working && <p className="small muted">L’équipe travaille : les actions git attendent qu’elle ait fini.</p>}
      {result && (
        <p className={`small git-result ${result.ok ? 'ok' : 'ko'}`}>
          {result.ok ? '✓ ' : <><Px e="⚠️" /> </>}{tidy(result.text)}
          {result.url && <> <a href={result.url} target="_blank" rel="noopener noreferrer">{result.url.includes('/pull/') ? 'Ouvrir la PR' : 'Créer la PR'} ↗</a></>}
        </p>
      )}
    </div>
  );
}

export function DiffSection() {
  const mission = useOffice((s) => s.mission);
  const diff = useOffice((s) => s.diff);
  const loading = useOffice((s) => s.diffLoading);
  const send = useOffice((s) => s.send);
  // ce qui doit relancer le diff : un fichier touché, la fin d'un tour, une action git
  const filesSig = useOffice((s) => s.files.reduce((n, f) => n + f.at, s.files.length));
  const endAt = useOffice((s) => s.final?.at ?? 0);
  const gitResult = useOffice((s) => s.gitResult);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [big, setBig] = useState(false);
  const missionId = mission?.id;

  const refresh = () => {
    if (!missionId) return;
    useOffice.setState({ diffLoading: true });
    send({ t: 'diff', missionId });
    send({ t: 'git', missionId, action: 'status' });
  };

  // tout de suite à l'ouverture, puis (avec un délai) quand l'équipe touche un fichier ou finit un tour
  const first = useRef(true);
  useEffect(() => {
    if (!missionId) return;
    if (first.current) { first.current = false; refresh(); return; }
    const t = setTimeout(refresh, 1500);
    return () => clearTimeout(t);
  }, [missionId, filesSig, endAt, gitResult]);

  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [big]);

  if (!mission) return null;
  const files = diff?.files ?? [];
  const adds = files.reduce((n, f) => n + f.additions, 0);
  const dels = files.reduce((n, f) => n + f.deletions, 0);
  const toggle = (p: string) => setOpen((o) => { const n = new Set(o); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const allOpen = files.length > 0 && files.every((f) => open.has(f.path));

  const body = (
    <section className={`card diff-card ${big ? 'big' : ''}`}>
      <GitState />
      <div className="diff-head">
        <b>{diff?.ok ? `${files.length} fichier${files.length > 1 ? 's' : ''}` : 'Le diff'}</b>
        {diff?.ok && files.length > 0 && <span className="diff-count"><i className="plus">+{adds}</i> <i className="minus">−{dels}</i></span>}
        <span className="grow" />
        {files.length > 0 && <button className="btn small ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(files.map((f) => f.path)))}>{allOpen ? 'Tout replier' : 'Tout déplier'}</button>}
        <button className="btn small ghost" title="Rafraîchir le diff" disabled={loading} onClick={() => { sfx('click'); refresh(); }}>{loading ? '…' : '↻'}</button>
        <button className="btn small ghost" title={big ? 'Réduire (Échap)' : 'Agrandir'} onClick={() => setBig((b) => !b)}>{big ? '×' : '⤢'}</button>
      </div>
      {diff?.note && <p className="small warn">{tidy(diff.note)}</p>}
      {!diff && <p className="small muted">Je calcule le diff…</p>}
      {diff && !diff.ok && <p className="small muted">{tidy(diff.text ?? 'Pas de diff.')}</p>}
      {diff?.ok && files.length === 0 && <p className="small muted">Aucun changement pour l’instant.</p>}
      <div className="diff-files">
        {files.map((f) => <FileRow key={f.path} f={f} open={open.has(f.path)} onToggle={() => toggle(f.path)} />)}
      </div>
      {diff?.truncated && <p className="small muted">Le diff est très gros : une partie n’est pas affichée ici. Regarde-le avec git.</p>}
      <GitDock />
    </section>
  );
  return big ? <div className="diff-back" onClick={(e) => { if (e.target === e.currentTarget) setBig(false); }}>{body}</div> : body;
}
