// Les fenêtres par-dessus le bureau : la carte du rendu final, la lecture d'un fichier,
// les missions précédentes, les réglages, et les petites notifications.
import { useMemo, useState } from 'react';
import { sfx } from '../audio/sfx.ts';
import { savePref, useOffice } from '../state/store.ts';
import { applySound } from '../audio/sound.ts';
import { FileList } from './Panel.tsx';
import { fmtDate, fmtDuration, plural, tilde } from './format.ts';
import { mdToHtml } from './md.ts';
import { tidy } from './tidy.ts';

/** La mission est rendue : Max te présente le travail de l'équipe. */
export function FinalCard() {
  const show = useOffice((s) => s.showFinal);
  const final = useOffice((s) => s.final);
  const mission = useOffice((s) => s.mission);
  const stats = useOffice((s) => s.stats);
  const workMs = useOffice((s) => s.workMs);
  const files = useOffice((s) => s.files.length);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  const html = useMemo(() => (final?.text ? mdToHtml(tidy(final.text)) : ''), [final?.text]);
  if (!show || !final || !mission) return null;
  const close = () => useOffice.setState({ showFinal: false });
  return (
    <div className="final" role="dialog" aria-label="Le rendu de la mission">
      <button className="close" onClick={close} aria-label="Fermer">×</button>
      <div className="final-head">
        <span className="final-badge"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <div>
          <b>Mission accomplie</b>
          <span>{mission.title} · {fmtDuration(workMs)}</span>
        </div>
      </div>
      <div className="final-stats">
        <span>🤖 {plural(stats.agents, 'agent', 'agents')}</span>
        <span>🔎 {plural(stats.searches, 'recherche', 'recherches')}</span>
        <span>🌐 {plural(stats.pages, 'page lue', 'pages lues')}</span>
        <span>📄 {plural(files, 'rendu', 'rendus')}</span>
      </div>
      {html && <div className="md final-text" dangerouslySetInnerHTML={{ __html: html }} />}
      {files > 0 && <FileList />}
      {!replaying && (
        <div className="final-actions">
          <button className="btn" onClick={() => send({ t: 'open', missionId: mission.id })}>Ouvrir le dossier</button>
          <button className="btn" onClick={() => { close(); useOffice.setState({ draft: ' ' }); }}>Continuer la conversation</button>
          <button className="btn primary" onClick={() => { sfx('click'); close(); send({ t: 'new' }); }}>Nouvelle mission</button>
        </div>
      )}
    </div>
  );
}

/** Lire un rendu (rapport, tableau…) sans quitter le bureau. */
export function Viewer() {
  const viewer = useOffice((s) => s.viewer);
  const send = useOffice((s) => s.send);
  const agents = useOffice((s) => s.agents);
  const versions = useOffice((s) => (s.viewer ? s.versions[`${s.viewer.missionId}|${s.viewer.file}`] : undefined));
  const html = useMemo(() => {
    if (!viewer?.text) return '';
    const ext = viewer.file.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'md' || ext === 'markdown') return mdToHtml(viewer.text);
    if (['html', 'htm', 'css', 'js', 'ts', 'py', 'json', 'svg'].includes(ext)) return '';
    if (ext === 'csv') {
      const sep = viewer.text.includes(';') && !viewer.text.split('\n')[0].includes(',') ? ';' : ',';
      const rows = viewer.text.trim().split('\n').slice(0, 200).map((r) => r.split(sep));
      const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/^"|"$/g, '');
      return `<table>${rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</table>`;
    }
    return '';
  }, [viewer]);
  if (!viewer) return null;
  const close = () => useOffice.setState({ viewer: null });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{viewer.file}</b>
          <div className="row">
            {versions && versions.length > 1 && (
              <select
                className="versions"
                title="L’historique des versions de ce fichier"
                value={viewer.version ?? ''}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  useOffice.setState({ viewer: { ...viewer, text: undefined, version: v } });
                  send({ t: 'read', missionId: viewer.missionId, file: viewer.file, version: v });
                }}
              >
                <option value="">Version actuelle</option>
                {versions.slice(1).map((v, i) => (
                  <option key={v.id} value={v.id}>
                    v{versions.length - 1 - i} · {new Date(v.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {v.by === 'chef' ? 'Max' : agents[v.by]?.name ?? 'l’équipe'}
                  </option>
                ))}
              </select>
            )}
            <button className="btn small" onClick={() => send({ t: 'open', missionId: viewer.missionId, file: viewer.file })}>Ouvrir avec l’appli</button>
            <button className="close" onClick={close} aria-label="Fermer">×</button>
          </div>
        </div>
        <div className="modal-body">
          {viewer.text === undefined ? <p className="muted">Ouverture…</p>
            : html ? <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
              : <pre className="plain">{viewer.text}</pre>}
          {viewer.truncated && <p className="small muted">(Fichier long : seul le début est affiché.)</p>}
        </div>
      </div>
    </div>
  );
}

/** Les missions précédentes : on peut les rejouer (pour filmer) ou ouvrir leur dossier. */
export function History() {
  const open = useOffice((s) => s.historyOpen);
  const missions = useOffice((s) => s.missions);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  const [project, setProject] = useState<string | null>(null);
  if (!open) return null;
  const close = () => useOffice.setState({ historyOpen: false });
  const projects = [...new Set(missions.map((m) => m.project ?? ''))];
  const shown = project === null ? missions : missions.filter((m) => (m.project ?? '') === project);
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal history" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>Mes missions</b><button className="close" onClick={close} aria-label="Fermer">×</button></div>
        <div className="modal-body">
          {connection !== 'live' && <p className="muted">Relie le bureau à Claude Code (npm start) pour retrouver tes missions.</p>}
          {connection === 'live' && !missions.length && <p className="muted">Aucune mission pour l’instant. La première t’attend en bas de l’écran.</p>}
          {projects.length > 1 && (
            <div className="chips">
              <button className={`chip ${project === null ? 'on' : ''}`} onClick={() => setProject(null)}>Tout</button>
              {projects.map((p) => (
                <button key={p} className={`chip ${project === p ? 'on' : ''}`} onClick={() => setProject(p)}>{p ? `🛠️ ${p}` : '📁 Missions libres'}</button>
              ))}
            </div>
          )}
          {shown.map((m) => (
            <div key={m.id} className="hist">
              <div className="hist-id">
                <b>{m.title}</b>
                <span className="small muted">
                  {m.project ? `🛠️ ${m.project}${m.branch ? ` · 🌿 ${m.branch}` : ''} · ` : ''}{fmtDate(m.createdAt)} · {fmtDuration(m.workMs)} · {plural(m.stats.agents, 'agent', 'agents')} · {plural(m.files.length, 'rendu', 'rendus')}
                  {m.status === 'working' ? ' · en cours' : m.status === 'done' ? '' : m.status === 'stopped' ? ' · arrêtée' : ' · en erreur'}
                </span>
              </div>
              <div className="row">
                <button className="btn small primary" title="Rouvre la conversation : son récap, ses fichiers, et tu peux la continuer avec Max" onClick={() => { sfx('click'); send({ t: 'resume', missionId: m.id }); }}>Ouvrir</button>
                <button className="btn small" title="Rejoue la mission (sans relancer l’équipe) : parfait pour filmer" onClick={() => { sfx('click'); close(); send({ t: 'replay', missionId: m.id }); }}>▶ Rejouer</button>
                <button className="btn small ghost" onClick={() => send({ t: 'open', missionId: m.id })}>Dossier</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CHEF_MODELS: [string, string][] = [['sonnet', 'Sonnet (rapide, recommandé)'], ['opus', 'Opus (le plus fin)'], ['fable', 'Fable'], ['haiku', 'Haiku (éclair)'], ['', 'Le modèle par défaut de Claude Code']];
const TEAM_MODELS: [string, string][] = [['sonnet', 'Sonnet (rapide, recommandé)'], ['haiku', 'Haiku (éclair, économe)'], ['opus', 'Opus (le plus fin)'], ['fable', 'Fable'], ['inherit', 'Le même que Max']];

export function SettingsPanel() {
  const open = useOffice((s) => s.settingsOpen);
  const settings = useOffice((s) => s.settings);
  const send = useOffice((s) => s.send);
  const claude = useOffice((s) => s.claude);
  const dir = useOffice((s) => s.dir);
  const voiceOn = useOffice((s) => s.voiceOn);
  const cameraAuto = useOffice((s) => s.cameraAuto);
  if (!open) return null;
  const close = () => useOffice.setState({ settingsOpen: false });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>Réglages du bureau</b><button className="close" onClick={close} aria-label="Fermer">×</button></div>
        <div className="modal-body">
          <label className="field">
            <span>Le cerveau de Max (le chef)</span>
            <select value={settings.chefModel} onChange={(e) => send({ t: 'settings', settings: { chefModel: e.target.value } })}>
              {CHEF_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Le cerveau de l’équipe</span>
            <select value={settings.teamModel} onChange={(e) => send({ t: 'settings', settings: { teamModel: e.target.value } })}>
              {TEAM_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="field">
            <span>Les permissions</span>
            <label className="radio"><input type="radio" checked={settings.permission === 'auto'} onChange={() => send({ t: 'settings', settings: { permission: 'auto' } })} /> L’équipe décide seule, et lève la main pour les gestes risqués</label>
            <label className="radio"><input type="radio" checked={settings.permission === 'ask'} onChange={() => send({ t: 'settings', settings: { permission: 'ask' } })} /> Elle demande avant chaque commande</label>
          </div>
          <div className="field">
            <span>Le spectacle</span>
            <label className="radio"><input type="checkbox" checked={voiceOn} onChange={(e) => { useOffice.setState({ voiceOn: e.target.checked }); savePref('voice', e.target.checked); applySound(useOffice.getState().sound); }} /> La voix de Max (« C’est parti ! », « Mission accomplie ! », la visite guidée)</label>
            <label className="radio"><input type="checkbox" checked={cameraAuto} onChange={(e) => { useOffice.setState({ cameraAuto: e.target.checked }); savePref('cameraAuto', e.target.checked); }} /> En mode tournage, la caméra suit l’action toute seule</label>
          </div>
          <p className="small muted">Les réglages comptent pour la prochaine mission. L’équipe ne travaille que dans le dossier de la mission (un nouveau dossier, ou celui que tu choisis sous la zone de saisie), et ne lance jamais rien hors du bureau sans te demander.</p>
          {claude?.found && <p className="small muted">Claude Code {claude.version} · {tilde(dir)}</p>}
          <div className="keys">
            <b>Raccourcis</b>
            <span><kbd>V</kbd> cadre vertical (reel)</span>
            <span><kbd>F</kbd> mode tournage</span>
            <span><kbd>C</kbd> caméra auto</span>
            <span><kbd>T</kbd> visite guidée</span>
            <span><kbd>J</kbd> jukebox</span>
            <span><kbd>N</kbd> jour, soir, nuit</span>
            <span><kbd>M</kbd> son</span>
            <span><kbd>H</kbd> missions précédentes</span>
            <span><kbd>Échap</kbd> fermer, sortir du tournage</span>
            <span>🥚 Il y a un code secret… (pense aux vieux jeux vidéo)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useOffice((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
