// L'écran du bureau : la barre du haut, le bureau en pixel art (avec le panneau de l'équipe à droite),
// et Max en bas, à qui tu parles. Le cadre vertical (9:16) sert à filmer un reel.
import { useEffect, useRef, useState } from 'react';
import { jukebox } from './audio/music.ts';
import { sfx } from './audio/sfx.ts';
import { applySound } from './audio/sound.ts';
import { denseOf, hasPref, projectModeOf, savePref, useOffice, type Tod } from './state/store.ts';
import { AskBar, Dialog } from './ui/Dialog.tsx';
import { FinalCard, History, SettingsPanel, Toasts, Viewer } from './ui/Modals.tsx';
import { Office } from './ui/Office.tsx';
import { Panel } from './ui/Panel.tsx';
import { Strips } from './ui/Strips.tsx';
import { party } from './ui/interact.ts';
import { Rooms } from './ui/Rooms.tsx';
import { startTour, stopTour } from './ui/tour.ts';
import { TopBar } from './ui/TopBar.tsx';

const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

/** Met le curseur dans la zone de saisie (pour écrire à Max). */
function focusComposer() {
  const area = document.querySelector<HTMLTextAreaElement>('.composer textarea');
  if (area && !area.disabled) area.focus();
}

const TOD_NEXT: Record<Tod, Tod> = { auto: 'day', day: 'evening', evening: 'night', night: 'auto' };

/** En mode tournage : un bouton pour en sortir, qui n'apparaît que quand la souris bouge (l'image reste propre). */
function ExitFilming() {
  const [shown, setShown] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraAuto = useOffice((s) => s.cameraAuto);
  useEffect(() => {
    const wake = () => {
      setShown(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShown(false), 2500);
    };
    wake();
    window.addEventListener('pointermove', wake);
    return () => { window.removeEventListener('pointermove', wake); if (timer.current) clearTimeout(timer.current); };
  }, []);
  return (
    <div className={`exit-filming ${shown ? 'shown' : ''}`}>
      <button onClick={() => { useOffice.setState({ cameraAuto: !cameraAuto }); savePref('cameraAuto', !cameraAuto); }}>{cameraAuto ? '🎥 Caméra auto : oui' : '🎥 Caméra auto : non'}</button>
      <button onClick={() => void startTour()}>🎤 Visite guidée</button>
      <button className="quit" onClick={() => useOffice.setState({ filming: false })}>✕ Quitter le tournage (F ou Échap)</button>
    </div>
  );
}

export function App() {
  const vertical = useOffice((s) => s.vertical || s.portrait);
  const project = useOffice(projectModeOf);
  const filming = useOffice((s) => s.filming);
  const dense = useOffice(denseOf);
  const officeHidden = useOffice((s) => denseOf(s) && s.officeHidden);

  // vue développeur : son et voix coupés par défaut (tant que tu ne les as pas réglés toi-même)
  useEffect(() => {
    const s = useOffice.getState();
    const patch: { sound?: boolean; voiceOn?: boolean } = {};
    if (!hasPref('sound')) patch.sound = !dense;
    if (!hasPref('voice')) patch.voiceOn = !dense;
    if ((patch.sound ?? s.sound) === s.sound && (patch.voiceOn ?? s.voiceOn) === s.voiceOn) return;
    useOffice.setState(patch);
    applySound(useOffice.getState().sound);
  }, [dense]);

  // sur un écran en hauteur (téléphone), la mise en page verticale s'impose
  useEffect(() => {
    const onResize = () => useOffice.setState({ portrait: window.innerWidth / Math.max(1, window.innerHeight) < 0.8 });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let combo: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Ctrl+K (ou ⌘K) : écrire à Max, même depuis un autre champ
      if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'k') { e.preventDefault(); focusComposer(); return; }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      // Alt+1, 2, 3 : les onglets du panneau (conversation, mission…)
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('bureau:tab', { detail: Number(e.code.slice(5)) - 1 }));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useOffice.getState();
      if (k === '/') { e.preventDefault(); focusComposer(); return; }
      // le code secret (↑ ↑ ↓ ↓ ← → ← → B A) : le mode soirée
      combo = [...combo, k].slice(-KONAMI.length);
      if (combo.join() === KONAMI.join()) { combo = []; party(); return; }
      if (k === 'escape') {
        if (s.tour) { stopTour(); return; }
        if (s.modal || s.viewer || s.historyOpen || s.settingsOpen || s.showFinal) {
          useOffice.setState({ modal: null, viewer: null, historyOpen: false, settingsOpen: false, showFinal: false });
          return;
        }
        if (s.filming) { useOffice.setState({ filming: false }); return; }
        // l'équipe travaille : Échap l'arrête (comme le bouton ■ Arrêter)
        if (s.busySince !== null && !s.replaying && s.mission) { sfx('click'); s.send({ t: 'stop' }); }
        return;
      }
      if (k === 'd') { const v = !denseOf(s); useOffice.setState({ dense: v }); savePref('dense', v); sfx('click'); return; }
      if (k === 'o' && denseOf(s)) { useOffice.setState({ officeHidden: !s.officeHidden }); savePref('officeHidden', !s.officeHidden); sfx('click'); return; }
      if (k === 't') { if (s.tour) stopTour(); else void startTour(); return; }
      if (k === 'c') { useOffice.setState({ cameraAuto: !s.cameraAuto }); savePref('cameraAuto', !s.cameraAuto); sfx('click'); return; }
      if (k === 'j') { jukebox.toggle(); return; }
      if (k === 'v') { useOffice.setState({ vertical: !s.vertical }); savePref('vertical', !s.vertical); sfx('click'); }
      else if (k === 'f') { useOffice.setState({ filming: !s.filming }); sfx('click'); }
      else if (k === 'n') { const n = TOD_NEXT[s.tod]; useOffice.setState({ tod: n }); savePref('tod', n); sfx('click'); }
      else if (k === 'm') { useOffice.setState({ sound: !s.sound }); savePref('sound', !s.sound); applySound(!s.sound); }
      else if (k === 'h') { useOffice.setState({ historyOpen: !s.historyOpen }); sfx('open'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app ${vertical ? 'vertical' : ''} ${filming ? 'filming' : ''} ${project ? 'project' : ''} ${dense ? 'dense' : ''} ${officeHidden ? 'office-hidden' : ''}`}>
      <div className="frame">
        <TopBar />
        <div className="main">
          <div className="stage">
            <Office />
            {vertical && <Strips />}
            {!officeHidden && <AskBar />}
            {!officeHidden && <FinalCard />}
          </div>
          {/* bureau replié : les demandes de permission et le récap restent visibles, par-dessus la conversation */}
          {officeHidden && <div className="stage-float"><AskBar /><FinalCard /></div>}
          {!vertical && !filming && <Panel />}
        </div>
        <Dialog />
      </div>
      {filming && <ExitFilming />}
      <Viewer />
      <Rooms />
      <History />
      <SettingsPanel />
      <Toasts />
    </div>
  );
}
