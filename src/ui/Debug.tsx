// Le menu de debug (touche F3) : les mesures du dessin (images par seconde, durée de chaque partie, mémoire),
// l'état du monde, et des interrupteurs pour changer la météo, l'heure, la vitesse, ou couper une couche de dessin.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { debug, perf, RING } from '../engine/debug.ts';
import { camera, timeOfDay, world } from '../engine/instance.ts';
import { weather } from '../engine/weather.ts';
import { W, H } from '../engine/layout.ts';
import { savePref, useOffice, type Tod } from '../state/store.ts';
import { party } from './interact.ts';

const f1 = (n: number) => n.toFixed(1);

/** Les durées d'image, de la plus ancienne à la plus récente. */
function recent(): number[] {
  const n = Math.min(perf.n, RING);
  const out: number[] = [];
  for (let i = perf.n - n; i < perf.n; i++) out.push(perf.ring[i % RING]);
  return out;
}

function stats() {
  const v = recent();
  if (!v.length) return { fps: 0, avg: 0, p95: 0, max: 0, v };
  const sorted = [...v].sort((a, b) => a - b);
  const now = performance.now();
  let fps = 0;
  for (let i = 0; i < Math.min(perf.n, RING); i++) if (now - perf.at[i] < 1000) fps++;
  return { fps, avg: v.reduce((a, b) => a + b, 0) / v.length, p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1], v };
}

function Graph({ values }: { values: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    const top = 20; // ms en haut du graphique
    const y = (ms: number) => c.height - Math.min(1, ms / top) * c.height;
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.moveTo(0, y(16.7));
    g.lineTo(c.width, y(16.7));
    g.stroke();
    const bw = c.width / RING;
    values.forEach((ms, i) => {
      g.fillStyle = ms > 16.7 ? '#ff6a5a' : ms > 8 ? '#ffc14a' : '#4be0a8';
      const h = c.height - y(ms);
      g.fillRect(i * bw, c.height - h, Math.max(1, bw - 0.5), Math.max(1, h));
    });
  });
  return <canvas ref={ref} className="dbg-graph" width={RING * 2} height={48} />;
}

const Row = ({ k, v, warn }: { k: string; v: ReactNode; warn?: boolean }) => (
  <div className={`dbg-row ${warn ? 'warn' : ''}`}><span>{k}</span><b>{v}</b></div>
);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="dbg-sec"><h4>{title}</h4>{children}</section>;
}

function Seg<T extends string | number>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="dbg-seg">
      {options.map(([v, label]) => <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>{label}</button>)}
    </div>
  );
}

function Switch({ label, on, onPick }: { label: string; on: boolean; onPick: (v: boolean) => void }) {
  return <label className="dbg-switch"><input type="checkbox" checked={on} onChange={(e) => onPick(e.target.checked)} />{label}</label>;
}

function Body() {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(id); }, []);
  const s = useOffice();
  const st = stats();
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const canvas = document.querySelector<HTMLCanvasElement>('.stage canvas');
  const actors = [...world.actors.values()];
  const mode = debug.fpsCap > 0 ? `${debug.fpsCap} (forcé)` : debug.fpsCap < 0 ? 'max' : world.calm ? '8' : '24';
  const set = (patch: Partial<typeof debug>) => Object.assign(debug, patch);
  const report = () => {
    const data = {
      fps: st.fps, ms: { avg: +f1(st.avg), p95: +f1(st.p95), max: +f1(st.max), update: +f1(perf.update), draw: +f1(perf.draw), present: +f1(perf.present) },
      frames: perf.frames, long: perf.long, tod: timeOfDay(s.tod), weather: { force: weather.force, level: +weather.level.toFixed(2) },
      actors: actors.length, particles: world.fx.list.length, heapMB: heap ? Math.round(heap.usedJSHeapSize / 1048576) : null,
      dom: document.getElementsByTagName('*').length, dpr: window.devicePixelRatio, flags: { ...debug }, ua: navigator.userAgent,
    };
    void navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
    s.toast('info', 'Le rapport de mesures est copié.');
  };

  return (
    <>
      <Section title="Performance">
        <div className="dbg-big">
          <div><b className={st.fps < 7 ? 'bad' : ''}>{st.fps}</b><small>images/s</small></div>
          <div><b className={st.avg > 8 ? 'bad' : ''}>{f1(st.avg)}</b><small>ms moy.</small></div>
          <div><b className={st.p95 > 16.7 ? 'bad' : ''}>{f1(st.p95)}</b><small>ms p95</small></div>
          <div><b>{f1(st.max)}</b><small>ms max</small></div>
        </div>
        <Graph values={st.v} />
        <Row k="Cadence visée (images/s)" v={mode} />
        <Row k="Logique du monde" v={`${f1(perf.update)} ms`} />
        <Row k="Dessin (render)" v={`${f1(perf.draw)} ms`} />
        <Row k="Affichage (agrandir)" v={`${f1(perf.present)} ms`} />
        <Row k="Images dessinées" v={perf.frames} />
        <Row k="Images > 16,7 ms" v={`${perf.long} (${perf.frames ? Math.round((perf.long / perf.frames) * 100) : 0} %)`} warn={perf.long > perf.frames * 0.05} />
        <Row k="Moyenne depuis le début" v={`${perf.frames ? f1(perf.ms / perf.frames) : '0.0'} ms`} />
        <Row k="Mémoire JS" v={heap ? `${Math.round(heap.usedJSHeapSize / 1048576)} / ${Math.round(heap.jsHeapSizeLimit / 1048576)} Mo` : 'indisponible'} />
        <Row k="Éléments DOM" v={document.getElementsByTagName('*').length} />
        <div className="dbg-btns"><button onClick={() => perf.reset()}>Remettre à zéro</button><button onClick={report}>Copier le rapport</button></div>
      </Section>

      <Section title="Météo">
        <Seg value={weather.force} options={[['auto', 'Auto'], ['rain', 'Pluie'], ['clear', 'Sec']]} onPick={(v) => { weather.force = v; tick((n) => n + 1); }} />
        <label className="dbg-range">Force max <b>{Math.round(weather.intensity * 100)} %</b>
          <input type="range" min="0.1" max="1" step="0.05" value={weather.intensity} onChange={(e) => { weather.intensity = Number(e.target.value); tick((n) => n + 1); }} />
        </label>
        <Row k="Niveau actuel" v={`${Math.round(weather.level * 100)} %`} />
      </Section>

      <Section title="Temps et monde">
        <Seg value={s.tod} options={[['auto', 'Auto'], ['day', 'Jour'], ['evening', 'Soir'], ['night', 'Nuit']] as [Tod, string][]} onPick={(v) => { useOffice.setState({ tod: v }); savePref('tod', v); }} />
        <Seg value={debug.pause ? 0 : world.speed} options={[[0, '⏸'], [0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×']]} onPick={(v) => { if (v === 0) set({ pause: !debug.pause }); else { set({ pause: false }); world.speed = v; } tick((n) => n + 1); }} />
        <Seg value={debug.fpsCap} options={[[0, 'Réglage'], [8, '8'], [15, '15'], [24, '24'], [60, '60'], [-1, 'Max']]} onPick={(v) => { set({ fpsCap: v }); tick((n) => n + 1); }} />
        <small className="dbg-hint">Heure · vitesse du monde · cadence du dessin</small>
      </Section>

      <Section title="Couches de dessin">
        <Switch label="Carte de lumière (soir et nuit)" on={!debug.noLight} onPick={(v) => set({ noLight: !v })} />
        <Switch label="Ambiance (rayons, flaques, poussière)" on={!debug.noAmbience} onPick={(v) => set({ noAmbience: !v })} />
        <Switch label="Météo (pluie, flaques)" on={!debug.noWeather} onPick={(v) => set({ noWeather: !v })} />
        <Switch label="Vie de la cour (feuilles, lucioles)" on={!debug.noYard} onPick={(v) => set({ noYard: !v })} />
        <Switch label="Grille de marche (rouge = bloqué)" on={debug.grid} onPick={(v) => set({ grid: v })} />
        <small className="dbg-hint">Coupe une couche et regarde les ms baisser.</small>
      </Section>

      <Section title="Rendu">
        <Row k="Image interne" v={`${W} × ${H}`} />
        <Row k="Canevas affiché" v={canvas ? `${canvas.width} × ${canvas.height} (${canvas.clientWidth} px à l'écran)` : '—'} />
        <Row k="Densité de pixels" v={window.devicePixelRatio} />
        <Row k="Zoom de la caméra" v={`${camera.zoom.toFixed(2)}×`} />
        <Row k="Heure affichée" v={timeOfDay(s.tod)} />
      </Section>

      <Section title="Le monde">
        <Row k="Temps du monde" v={`${Math.floor(world.time)} s`} />
        <Row k="Robots" v={`${actors.length} (${actors.filter((a) => a.seated).length} assis, ${actors.filter((a) => a.moving).length} en marche)`} />
        <Row k="Particules" v={world.fx.list.length} />
        <Row k="Mission en cours" v={world.missionActive ? 'oui' : 'non'} />
        <Row k="Monde au calme" v={world.calm ? 'oui' : 'non'} />
        <Row k="Musique" v={world.musicOn ? `oui (${Math.round(world.musicLevel * 100)} %)` : 'non'} />
        <Row k="Lampadaires éteints" v={world.lampsOff.size} />
        <Row k="Néon" v={world.neonIndex + 1} />
        <Row k="Chat" v={`${Math.round(world.cat.x)}, ${Math.round(world.cat.y)}${world.cat.onSofa ? ' (canapé)' : ''}`} />
        <div className="dbg-btns">
          <button onClick={() => party()}>Fête</button>
          <button onClick={() => { world.lampsOff.clear(); }}>Allumer les lampes</button>
          <button onClick={() => { world.neonIndex = (world.neonIndex + 1) % 5; }}>Néon suivant</button>
        </div>
      </Section>

      <Section title="L'application">
        <Row k="Connexion" v={s.connection} />
        <Row k="Rejeu" v={s.replaying ? 'oui' : 'non'} />
        <Row k="Équipe au travail" v={s.busySince !== null ? 'oui' : 'non'} />
        <Row k="Navigateur" v={navigator.userAgent.split(' ').slice(-2).join(' ')} />
      </Section>
    </>
  );
}

export function DebugMenu() {
  const open = useOffice((s) => s.debugOpen);
  const [right, setRight] = useState(false);
  if (!open) return null;
  return (
    <aside className={`debug ${right ? 'right' : ''}`} aria-label="Menu de debug">
      <header>
        <b>Debug</b>
        <small>F3 pour fermer</small>
        <button onClick={() => setRight(!right)} aria-label="Changer de côté" title="Changer de côté">⇄</button>
        <button onClick={() => useOffice.setState({ debugOpen: false })} aria-label="Fermer">✕</button>
      </header>
      <div className="dbg-body"><Body /></div>
    </aside>
  );
}
