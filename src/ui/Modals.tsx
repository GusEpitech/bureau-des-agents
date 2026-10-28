// Les fenêtres par-dessus le bureau : la carte du rendu final, la lecture d'un fichier,
// les missions précédentes, les réglages, et les petites notifications.
import { useEffect, useMemo, useState } from 'react';
import { EFFORTS, mcpKey, roleInfo } from '../../shared/activity.ts';
import type { Role } from '../../shared/protocol.ts';
import { BRANCH_TOKENS, branchName, DEFAULT_BRANCH_PATTERN } from '../../shared/branch.ts';
import { sfx } from '../audio/sfx.ts';
import { denseOf, projectModeOf, savePref, techOf, useOffice } from '../state/store.ts';
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
          <button className="btn" onClick={() => send({ t: 'open', missionId: mission.id })}>{mission.project ? 'Ouvrir dans l’éditeur' : 'Ouvrir le dossier'}</button>
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
  const tech = useOffice(techOf);
  const dense = useOffice(denseOf);
  if (!open) return null;
  const close = () => useOffice.setState({ settingsOpen: false });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>Réglages du bureau</b><button className="close" onClick={close} aria-label="Fermer">×</button></div>
        <div className="modal-body">
          <section className="set-group">
            <h3>Les cerveaux</h3>
            <p className="set-help">Un modèle rapide suffit pour la plupart des missions. Le changement compte à la prochaine mission.</p>
            <label className="field">
              <span>Max, le chef</span>
              <select value={settings.chefModel} onChange={(e) => send({ t: 'settings', settings: { chefModel: e.target.value } })}>
                {CHEF_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">
              <span>L’équipe</span>
              <select value={settings.teamModel} onChange={(e) => send({ t: 'settings', settings: { teamModel: e.target.value } })}>
                {TEAM_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <RoleModels />
          </section>

          <section className="set-group">
            <h3>Économiser des tokens</h3>
            <p className="set-help">Ce que Max relit à chaque tour compte dans ton énergie. Ces réglages l’allègent. Ils comptent à la prochaine mission.</p>
            <label className="radio"><input type="checkbox" checked={settings.skills} onChange={(e) => send({ t: 'settings', settings: { skills: e.target.checked } })} /> <span><b>Charger mes skills</b> : environ 7 000 tokens de plus à chaque tour. Décoché, Max travaille sans tes skills (le plus économe).</span></label>
            <label className="field">
              <span>Effort de réflexion de Max</span>
              <select value={settings.chefEffort} onChange={(e) => send({ t: 'settings', settings: { chefEffort: e.target.value } })}>
                {EFFORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <McpOffField />
          </section>

          <section className="set-group">
            <h3>Le travail dans un projet</h3>
            <p className="set-help">Quand tu choisis un dossier sous la zone de saisie, l’équipe suit ta config Claude Code (réglages, MCP, agents ; tes skills seulement si tu les actives plus haut). En mode complet, Max te soumet son plan avant de coder ; en mode rapide, il fait la petite tâche tout seul.</p>
            <BranchField />
            <div className="field">
              <span>Les permissions</span>
              <label className="radio"><input type="radio" checked={settings.permission === 'auto'} onChange={() => send({ t: 'settings', settings: { permission: 'auto' } })} /> L’équipe décide seule, et lève la main pour les gestes risqués</label>
              <label className="radio"><input type="radio" checked={settings.permission === 'ask'} onChange={() => send({ t: 'settings', settings: { permission: 'ask' } })} /> Elle demande avant chaque commande</label>
            </div>
          </section>

          <section className="set-group">
            <h3>L’affichage</h3>
            <label className="radio"><input type="checkbox" checked={dense} onChange={(e) => { useOffice.setState({ dense: e.target.checked }); savePref('dense', e.target.checked); }} /> <span><b>Vue développeur</b> : la conversation en grand, le bureau en petit, sans son par défaut (D)</span></label>
            <label className="radio"><input type="checkbox" checked={tech} onChange={(e) => { useOffice.setState({ tech: e.target.checked }); savePref('tech', e.target.checked); }} /> <span><b>Mode technique</b> : les vraies commandes, leurs sorties, les prompts et les tokens (X)</span></label>
          </section>

          <section className="set-group">
            <h3>Le spectacle</h3>
            <label className="radio"><input type="checkbox" checked={voiceOn} onChange={(e) => { useOffice.setState({ voiceOn: e.target.checked }); savePref('voice', e.target.checked); applySound(useOffice.getState().sound); }} /> <span><b>La voix de Max</b> : « C’est parti ! », « Mission accomplie ! », la visite guidée</span></label>
            <label className="radio"><input type="checkbox" checked={cameraAuto} onChange={(e) => { useOffice.setState({ cameraAuto: e.target.checked }); savePref('cameraAuto', e.target.checked); }} /> <span><b>Caméra automatique</b> en mode tournage : elle suit l’action toute seule (C)</span></label>
          </section>

          <p className="small muted">L’équipe ne travaille que dans le dossier de la mission et ne lance jamais rien hors du bureau sans te demander.{claude?.found ? ` Claude Code ${claude.version} · ${tilde(dir)}` : ''}</p>
          <details className="keys-box">
            <summary>Raccourcis clavier</summary>
          <div className="keys">
            <span><kbd>V</kbd> cadre vertical (reel)</span>
            <span><kbd>F</kbd> mode tournage</span>
            <span><kbd>C</kbd> caméra auto</span>
            <span><kbd>T</kbd> visite guidée</span>
            <span><kbd>J</kbd> jukebox</span>
            <span><kbd>N</kbd> jour, soir, nuit</span>
            <span><kbd>M</kbd> son</span>
            <span><kbd>X</kbd> mode technique</span>
            <span><kbd>H</kbd> missions précédentes</span>
            <span><kbd>D</kbd> vue développeur</span>
            <span><kbd>O</kbd> replier le bureau (vue développeur)</span>
            <span><kbd>/</kbd> ou <kbd>Ctrl</kbd>+<kbd>K</kbd> écrire à Max</span>
            <span><kbd>Alt</kbd>+<kbd>1</kbd>, <kbd>2</kbd>… onglets du panneau</span>
            <span><kbd>Échap</kbd> fermer, sortir du tournage, arrêter l’équipe</span>
            <span>🥚 Il y a un code secret… (pense aux vieux jeux vidéo)</span>
          </div>
          </details>
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

/** Mode projet : le modèle du nom des branches, avec un aperçu (enregistré quand on quitte le champ). */
function BranchField() {
  const saved = useOffice((s) => s.settings.branchPattern);
  const send = useOffice((s) => s.send);
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const save = () => { if (value.trim() !== saved) send({ t: 'settings', settings: { branchPattern: value.trim() || DEFAULT_BRANCH_PATTERN } }); };
  const preview = branchName(value, { title: 'Choisir qui accède à quel cours', prompt: 'Implémente le ticket SCRUM-17', project: 'corelab', now: new Date() });
  return (
    <label className="field">
      <span>Le nom des branches (mode projet)</span>
      <input
        className="branch-input"
        value={value}
        spellCheck={false}
        placeholder={DEFAULT_BRANCH_PATTERN}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); (e.target as HTMLInputElement).blur(); } }}
      />
      <small className="muted">Exemple : <code>{preview}</code></small>
      <small className="muted branch-tokens">{BRANCH_TOKENS.map(([t, d]) => <span key={t}><code>{t}</code> {d}</span>)}</small>
    </label>
  );
}

const MODEL_ROLES: Role[] = ['recherche', 'code', 'design', 'redaction', 'analyse'];

/** Un cerveau par métier : par exemple Haiku pour l'exploration, Opus pour le code. « Comme l'équipe » = le réglage du dessus. */
/** Les connecteurs MCP de ce projet : ceux qu'on décoche sont retirés des outils de Max (moins de bruit, moins de gros résultats). */
function McpOffField() {
  const workdir = useOffice((s) => s.settings.workdir);
  const off = useOffice((s) => s.settings.mcpOff);
  const mcp = useOffice((s) => s.mcp);
  const loading = useOffice((s) => s.mcpLoading);
  const send = useOffice((s) => s.send);
  const load = () => { sfx('click'); useOffice.setState({ mcpLoading: true }); send({ t: 'mcp_list' }); };
  useEffect(() => { if (workdir && !useOffice.getState().mcp && !useOffice.getState().mcpLoading) load(); }, [workdir]);
  if (!workdir) return <p className="set-help">Les connecteurs MCP se règlent par projet : choisis un projet sous la zone de saisie.</p>;
  const mine = off[workdir] ?? [];
  const servers = (mcp?.servers ?? []).filter((x) => x.status !== 'disabled');
  const toggle = (key: string, on: boolean) => {
    const next = on ? mine.filter((k) => k !== key) : [...new Set([...mine, key])];
    send({ t: 'settings', settings: { mcpOff: { ...off, [workdir]: next } } });
  };
  return (
    <div className="field">
      <span>Les connecteurs de ce projet</span>
      {servers.length === 0
        ? <p className="set-help">{loading ? 'Vérification…' : 'Pas encore de liste.'} <button className="btn small ghost" disabled={loading} onClick={load}>Charger la liste</button></p>
        : (
          <div className="mcp-off">
            {servers.map((x) => {
              const key = mcpKey(x);
              const on = !mine.includes(key);
              return (
                <label key={key} className="radio"><input type="checkbox" checked={on} onChange={(e) => toggle(key, e.target.checked)} /> <span><b>{x.name}</b> <em>{x.source === 'claude.ai' ? 'compte' : 'local'}{x.tools ? ` · ${x.tools} outils` : ''}</em></span></label>
              );
            })}
          </div>
        )}
      <small className="muted">Décoche ceux dont Max n’a pas besoin sur ce projet : ils ne lui sont plus proposés.</small>
    </div>
  );
}

function RoleModels() {
  const settings = useOffice((s) => s.settings);
  const send = useOffice((s) => s.send);
  useOffice(projectModeOf); // les noms des métiers suivent le mode projet
  const set = (r: Role, model: string) => {
    const next = { ...settings.roleModels };
    if (model) next[r] = model; else delete next[r];
    send({ t: 'settings', settings: { roleModels: next } });
  };
  const setEffort = (r: Role, e: string) => {
    const next = { ...settings.roleEffort };
    if (e) next[r] = e; else delete next[r];
    send({ t: 'settings', settings: { roleEffort: next } });
  };
  const team = settings.teamModel === 'inherit' ? 'comme Max' : settings.teamModel;
  return (
    <details className="field adv" open={Object.keys(settings.roleModels).length > 0}>
      <summary>Un cerveau par métier <em>(avancé)</em></summary>
      <div className="role-models">
        {MODEL_ROLES.map((r) => (
          <label key={r}>
            <b>{roleInfo(r).icon} {roleInfo(r).label}</b>
            <select value={settings.roleModels[r] ?? ''} onChange={(e) => set(r, e.target.value)} aria-label="Modèle">
              <option value="">Comme l’équipe ({team})</option>
              {TEAM_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="effort" value={settings.roleEffort?.[r] ?? ''} aria-label="Effort de réflexion" title="Effort de réflexion de ce métier" onChange={(e) => setEffort(r, e.target.value)}>
              {EFFORTS.map(([v, l]) => <option key={v} value={v}>{v ? `Effort : ${l.split(' (')[0].toLowerCase()}` : 'Effort : par défaut'}</option>)}
            </select>
          </label>
        ))}
      </div>
      <small className="muted">Haiku va vite et consomme peu : idéal pour explorer. Opus est le plus fin pour le code.</small>
    </details>
  );
}
