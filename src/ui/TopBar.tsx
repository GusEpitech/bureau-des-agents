// La barre du haut : le nom du bureau, la mission en cours et son chrono, les compteurs (agents,
// recherches, pages lues, rendus), l'énergie de ton abonnement, et les réglages d'affichage.
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../audio/sfx.ts';
import { applySound } from '../audio/sound.ts';
import { replaySpeed, stopReplay } from '../net/link.ts';
import { denseOf, projectModeOf, savePref, useOffice, type Tod } from '../state/store.ts';
import { fmtClock } from './format.ts';
import { startTour } from './tour.ts';
import { Px } from './Px.tsx';

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <span className="logo-visor"><i /><i /></span>
    </span>
  );
}

function useTick(on: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setN((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [on]);
}

const TOD_NEXT: Record<Tod, Tod> = { auto: 'day', day: 'evening', evening: 'night', night: 'auto' };
const TOD_ICON: Record<Tod, string> = { auto: '🕒', day: '☀️', evening: '🌇', night: '🌙' };
const TOD_LABEL: Record<Tod, string> = { auto: 'Heure de ton Mac', day: 'Jour', evening: 'Soir', night: 'Nuit' };

/** Le menu « Affichage » : tout ce qui change la façon de voir le bureau, rangé au même endroit. */
function ViewMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const vertical = useOffice((s) => s.vertical);
  const tod = useOffice((s) => s.tod);
  const musicOn = useOffice((s) => s.music.playing);
  const dense = useOffice(denseOf);
  const officeHidden = useOffice((s) => s.officeHidden);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  const flip = (k: 'vertical' | 'filming') => () => {
    sfx('click');
    const v = !useOffice.getState()[k];
    useOffice.setState({ [k]: v });
    if (k === 'vertical') savePref('vertical', v);
  };
  return (
    <div className="view-menu" ref={box}>
      <button className={`tool-btn ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} title="Visite guidée, jukebox, heure du bureau, cadre vertical, tournage…" onClick={() => { sfx('click'); setOpen(!open); }}>
        <span aria-hidden="true"><Px e="🎛️" /></span><span className="tool-label">Affichage</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          {dense && (
            <button role="menuitem" onClick={run(() => { sfx('click'); useOffice.setState({ officeHidden: !officeHidden }); savePref('officeHidden', !officeHidden); })}>
              <i>{officeHidden ? <Px e="🏢" /> : '⇤'}</i><span>{officeHidden ? 'Déplier le bureau animé' : 'Replier le bureau animé'}</span><kbd>O</kbd>
            </button>
          )}
          <button role="menuitem" onClick={run(() => void startTour())}><i><Px e="🎤" /></i><span>Visite guidée de Max</span><kbd>T</kbd></button>
          <button role="menuitem" onClick={run(() => { sfx('open'); useOffice.setState({ modal: { kind: 'jukebox' } }); })}><i><Px e={musicOn ? '🎶' : '🎵'} /></i><span>Le jukebox{musicOn ? ' (en train de jouer)' : ''}</span><kbd>J</kbd></button>
          <button role="menuitem" onClick={() => { sfx('click'); const n = TOD_NEXT[tod]; useOffice.setState({ tod: n }); savePref('tod', n); }}><i><Px e={TOD_ICON[tod]} /></i><span>Heure du bureau : {tod === 'auto' ? 'automatique' : TOD_LABEL[tod].toLowerCase()}</span><kbd>N</kbd></button>
          <div className="menu-sep" />
          <button role="menuitem" onClick={run(flip('vertical'))}><i><Px e="📱" /></i><span>Cadre vertical 9:16 {vertical ? '(activé)' : ''}</span><kbd>V</kbd></button>
          <button role="menuitem" onClick={run(flip('filming'))}><i><Px e="🎬" /></i><span>Mode tournage (juste le bureau)</span><kbd>F</kbd></button>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const mission = useOffice((s) => s.mission);
  const busySince = useOffice((s) => s.busySince);
  const workMs = useOffice((s) => s.workMs);
  const stats = useOffice((s) => s.stats);
  const files = useOffice((s) => s.files.length);
  const plan = useOffice((s) => s.plan);
  const quota = useOffice((s) => s.quota);
  const replaying = useOffice((s) => s.replaying);
  const connection = useOffice((s) => s.connection);
  const send = useOffice((s) => s.send);
  // « mesure en cours » : jusqu'à l'arrivée du nouveau quota (ou 15 s au plus)
  const [measuring, setMeasuring] = useState(false);
  useEffect(() => {
    if (!measuring) return;
    const t = setTimeout(() => setMeasuring(false), 15000);
    return () => clearTimeout(t);
  }, [measuring]);
  useEffect(() => setMeasuring(false), [quota?.at, quota?.fiveHour]);
  // le nom du projet (mode projet) : celui de la mission, ou celui choisi pour la prochaine
  const projectName = useOffice((s) => (projectModeOf(s) ? s.mission?.project ?? s.settings.workdir.split('/').filter(Boolean).pop() ?? '' : ''));
  const final = useOffice((s) => s.final);
  const sound = useOffice((s) => s.sound);
  useTick(busySince !== null);
  const elapsed = workMs + (busySince ? Date.now() - busySince : 0);
  const done = plan.filter((p) => p.status === 'completed').length;
  const current = plan.find((p) => p.status === 'in_progress') ?? plan.find((p) => p.status === 'pending');

  const status = !mission ? null : busySince ? 'live' : final?.ok ? 'done' : mission.status === 'error' ? 'error' : 'stopped';
  const toggle = (k: 'vertical' | 'filming' | 'sound') => {
    sfx('click');
    const v = !useOffice.getState()[k];
    useOffice.setState({ [k]: v });
    if (k !== 'filming') savePref(k, v);
    if (k === 'sound') applySound(v);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <b>Le Bureau des agents</b>
          <span>{connection === 'demo' ? 'Démo · VibesMoney' : 'par VibesMoney'}</span>
        </div>
        {projectName && <span className="project-badge" title="Mode projet : l’équipe travaille dans ce projet"><Px e="🛠️" /> {projectName}{mission?.quick ? <> <Px e="⚡" /></> : null}</span>}
      </div>

      <div className="mission-head">
        {mission ? (
          <>
            <span className={`dot ${status}`} />
            <span className="mission-title" title={mission.prompt}>{mission.title}</span>
            <span className="timer">{fmtClock(elapsed)}</span>
          </>
        ) : <span className="muted">Aucune mission en cours</span>}
        {mission && plan.length > 0 && (
          <span className="plan-step" title={current?.text ?? ''}><Px e="📋" /> {done}/{plan.length}{current && busySince ? ` · ${current.text}` : ''}</span>
        )}
      </div>

      {mission && (
        <div className="stats">
          <span title="Agents appelés"><Px e="🤖" /> {stats.agents}</span>
          {!mission.project && <span title="Recherches sur internet"><Px e="🔎" /> {stats.searches}</span>}
          {!mission.project && <span title="Pages web lues"><Px e="🌐" /> {stats.pages}</span>}
          {!mission.project && <span title="Fichiers rendus"><Px e="📄" /> {files}</span>}
        </div>
      )}

      {replaying && (
        <div className="replay-bar">
          <span>Rediffusion</span>
          {[1, 2, 4].map((x) => <button key={x} onClick={() => replaySpeed(x)}>×{x}</button>)}
          {connection !== 'demo' && <button onClick={() => { sfx('click'); stopReplay(); }}>Quitter</button>}
        </div>
      )}

      <div className="topbar-tools">
        {connection === 'live' && (
          <button
            className={`energy ${quota ? (quota.fiveHour >= 0.85 ? 'low' : quota.fiveHour >= 0.6 ? 'mid' : '') : 'unknown'} ${measuring ? 'measuring' : ''}`}
            title={quota
              ? `Ton abonnement sur 5 heures : ${Math.round(quota.fiveHour * 100)} % utilisés, ${Math.round((1 - quota.fiveHour) * 100)} % restants`
                + `${quota.sevenDay !== undefined ? ` · sur 7 jours : ${Math.round(quota.sevenDay * 100)} % utilisés` : ''}`
                + `${quota.at ? ` · mesuré à ${new Date(quota.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}. Clique pour mesurer maintenant.`
              : 'Énergie pas encore mesurée. Clique pour la mesurer.'}
            onClick={() => { sfx('click'); setMeasuring(true); send({ t: 'quota_refresh' }); }}
          >
            <span className="energy-label">Énergie</span>
            <span className="energy-bar"><i style={{ width: `${quota ? Math.max(3, 100 - quota.fiveHour * 100) : 0}%` }} /></span>
            {quota && <span className="energy-pct">{Math.round((1 - quota.fiveHour) * 100)} %</span>}
          </button>
        )}
        <button className="tool-btn" title="Toute l’équipe : les métiers, leurs outils, l’historique" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'team' } }); }}><span aria-hidden="true"><Px e="👥" /></span><span className="tool-label">Équipe</span></button>
        <button className="tool-btn" title="Les missions précédentes (H)" onClick={() => { sfx('open'); useOffice.setState({ historyOpen: true }); }}><span aria-hidden="true"><Px e="🗂️" /></span><span className="tool-label">Historique</span></button>
        <span className="tool-sep" aria-hidden="true" />
        <button className="icon-btn" title={sound ? 'Couper le son (M)' : 'Remettre le son (M)'} aria-label={sound ? 'Couper le son' : 'Remettre le son'} onClick={() => toggle('sound')}><Px e={sound ? '🔊' : '🔇'} /></button>
        <ViewMenu />
        <button className="tool-btn" title="Réglages" onClick={() => { sfx('open'); useOffice.setState({ settingsOpen: true }); }}><span aria-hidden="true"><Px e="⚙️" /></span><span className="tool-label">Réglages</span></button>
      </div>
    </header>
  );
}
