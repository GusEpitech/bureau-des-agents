// La barre du haut : le nom du bureau, la mission en cours et son chrono, les compteurs (agents,
// recherches, pages lues, rendus), l'énergie de ton abonnement, et les réglages d'affichage.
import { useEffect, useState } from 'react';
import { sfx } from '../audio/sfx.ts';
import { applySound } from '../audio/sound.ts';
import { replaySpeed, stopReplay } from '../net/link.ts';
import { denseOf, projectModeOf, savePref, useOffice, type Tod } from '../state/store.ts';
import { fmtClock } from './format.ts';
import { startTour } from './tour.ts';

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
  // le nom du projet (mode projet) : celui de la mission, ou celui choisi pour la prochaine
  const projectName = useOffice((s) => (projectModeOf(s) ? s.mission?.project ?? s.settings.workdir.split('/').filter(Boolean).pop() ?? '' : ''));
  const final = useOffice((s) => s.final);
  const vertical = useOffice((s) => s.vertical);
  const filming = useOffice((s) => s.filming);
  const dense = useOffice(denseOf);
  const officeHidden = useOffice((s) => s.officeHidden);
  const sound = useOffice((s) => s.sound);
  const tod = useOffice((s) => s.tod);
  const musicOn = useOffice((s) => s.music.playing);
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
        {projectName && <span className="project-badge" title="Mode projet : l’équipe travaille dans ce projet">🛠️ {projectName}</span>}
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
          <span className="plan-step" title={current?.text ?? ''}>📋 {done}/{plan.length}{current && busySince ? ` · ${current.text}` : ''}</span>
        )}
      </div>

      {mission && (
        <div className="stats">
          <span title="Agents appelés">🤖 {stats.agents}</span>
          <span title="Recherches sur internet">🔎 {stats.searches}</span>
          <span title="Pages web lues">🌐 {stats.pages}</span>
          <span title="Fichiers rendus">📄 {files}</span>
        </div>
      )}

      {replaying && (
        <div className="replay-bar">
          <span>Rediffusion</span>
          {[1, 2, 4].map((x) => <button key={x} onClick={() => replaySpeed(x)}>×{x}</button>)}
          {connection !== 'demo' && <button onClick={() => { sfx('click'); stopReplay(); }}>Quitter</button>}
        </div>
      )}

      <div className="tools">
        {quota && (
          <span className="energy" title={`Ton abonnement sur 5 heures : ${Math.round(quota.fiveHour * 100)} % utilisés`}>
            <span className="energy-label">Énergie</span>
            <span className="energy-bar"><i style={{ width: `${Math.max(3, 100 - quota.fiveHour * 100)}%` }} /></span>
          </span>
        )}
        {dense && (
          <button className={`icon-btn ${officeHidden ? 'on' : ''}`} title={officeHidden ? 'Déplier le bureau animé (O)' : 'Replier le bureau animé : la conversation prend toute la place (O)'}
            onClick={() => { sfx('click'); useOffice.setState({ officeHidden: !officeHidden }); savePref('officeHidden', !officeHidden); }}>{officeHidden ? '🏢' : '⇤'}</button>
        )}
        <button className="icon-btn" title="Visite guidée : Max présente son bureau (T)" onClick={() => void startTour()}>🎤</button>
        <button className="icon-btn" title="Toute l’équipe : les métiers, leurs outils, l’historique" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'team' } }); }}>👥</button>
        <button className={`icon-btn ${musicOn ? 'on' : ''}`} title="Le jukebox (J)" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'jukebox' } }); }}>{musicOn ? '🎶' : '🎵'}</button>
        <button className="icon-btn" title="Missions précédentes (H)" onClick={() => { sfx('open'); useOffice.setState({ historyOpen: true }); }}>🗂️</button>
        <button className="icon-btn" title={`L’heure du bureau : ${TOD_LABEL[tod]} (N)`} onClick={() => { sfx('click'); const n = TOD_NEXT[tod]; useOffice.setState({ tod: n }); savePref('tod', n); }}>{TOD_ICON[tod]}</button>
        <button className="icon-btn" title={sound ? 'Couper le son (M)' : 'Remettre le son (M)'} onClick={() => toggle('sound')}>{sound ? '🔊' : '🔇'}</button>
        <button className={`icon-btn ${vertical ? 'on' : ''}`} title="Cadre vertical 9:16, pour filmer un reel (V)" onClick={() => toggle('vertical')}>📱</button>
        <button className={`icon-btn ${filming ? 'on' : ''}`} title="Mode tournage : juste le bureau et Max (F)" onClick={() => toggle('filming')}>🎬</button>
        <button className="icon-btn" title="Réglages" onClick={() => { sfx('open'); useOffice.setState({ settingsOpen: true }); }}>⚙️</button>
      </div>
    </header>
  );
}
