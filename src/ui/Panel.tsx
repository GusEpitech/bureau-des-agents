// Le panneau de droite : le plan de Max, l'équipe au travail (ce que chacun fait, son rapport),
// les rendus (les fichiers produits) et le fil de ce qui se passe. Sans mission : comment ça marche.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { roleInfo } from '../../shared/activity.ts';
import type { Role } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { robotSprite } from '../engine/robots.ts';
import { pendingPlanOf, projectModeOf, savePref, teamList, techOf, useOffice, type AgentView } from '../state/store.ts';
import { techLabel } from './tech.ts';
import { PromptBox, TechActs } from './Tech.tsx';
import { ChatSection } from './Chat.tsx';
import { DiffSection } from './Diff.tsx';
import { EXAMPLES, PROJECT_EXAMPLES } from './Dialog.tsx';
import { fmtDate, fmtDuration, tilde } from './format.ts';
import { mdToHtml } from './md.ts';
import { FileActions } from './Rooms.tsx';
import { tidy } from './tidy.ts';

export function Avatar({ role, size = 32 }: { role: Role; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 20, 24);
    g.drawImage(robotSprite(role, 'stand', 'down', 0, 'open'), 0, 0);
  }, [role]);
  return <canvas ref={ref} width={20} height={24} className="avatar" style={{ width: size * (20 / 24), height: size }} />;
}

const STATUS: Record<AgentView['status'], string> = { working: 'Au travail', reporting: 'Rend son rapport', done: 'A rendu son travail', failed: 'N’a pas pu finir' };

type Tab = 'chat' | 'mission' | 'diff';
const readTab = (): Tab => {
  try { const v = localStorage.getItem('bureau:panelTab'); return v === '"mission"' ? 'mission' : v === '"diff"' ? 'diff' : 'chat'; } catch { return 'chat'; }
};

export function Panel() {
  const mission = useOffice((s) => s.mission);
  const final = useOffice((s) => s.final);
  const busy = useOffice((s) => s.busySince !== null);
  const project = useOffice(projectModeOf);
  const [picked, setTab] = useState(readTab);
  // l'onglet « Diff » n'existe qu'en mode projet
  const tab: Tab = picked === 'diff' && !project ? 'chat' : picked;
  const pick = (t: Tab) => { setTab(t); savePref('panelTab', t); };
  // un plan de Max à valider : on ramène la conversation, c'est là qu'il se valide
  const planId = useOffice((s) => pendingPlanOf(s)?.requestId);
  useEffect(() => { if (planId) setTab('chat'); }, [planId]);
  return (
    <aside className={`panel ${mission && tab === 'chat' ? 'chatting' : ''}`}>
      {mission ? (
        <>
          <div className="panel-tabs">
            <div className="seg">
              <button className={tab === 'chat' ? 'on' : ''} onClick={() => pick('chat')}>💬 Conversation</button>
              <button className={tab === 'mission' ? 'on' : ''} onClick={() => pick('mission')}>📋 La mission</button>
              {project && <button className={tab === 'diff' ? 'on' : ''} onClick={() => pick('diff')}>🔀 Diff</button>}
            </div>
            {final && !busy && <button className="btn small ghost" title="Le récap de Max et les fichiers" onClick={() => { sfx('open'); useOffice.setState({ showFinal: true }); }}>Récap</button>}
          </div>
          {tab === 'chat' ? <ChatSection /> : tab === 'diff' ? <DiffSection /> : (
            <>
              <PlanSection />
              <TeamSection />
              <FilesSection />
              <FeedSection />
            </>
          )}
        </>
      ) : <Welcome />}
    </aside>
  );
}

function Welcome() {
  const missions = useOffice((s) => s.missions);
  const dir = useOffice((s) => s.dir);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  const project = useOffice(projectModeOf);
  return (
    <>
      <section className="card">
        <h3>{project ? 'Le mode projet' : 'Comment ça marche'}</h3>
        {project ? (
          <ol className="steps">
            <li><b>Tu dis à Max quoi faire dans ton code</b> : un bug, une fonctionnalité, des tests.</li>
            <li><b>Il crée une branche git</b> et lit ton projet (son CLAUDE.md, son README).</li>
            <li><b>L’équipe s’y met</b> : exploration, code, interface, docs, tests.</li>
            <li><b>Tu relis le diff et tu commites</b> : l’équipe ne commite jamais à ta place.</li>
          </ol>
        ) : (
        <ol className="steps">
          <li><b>Tu dis à Max ce que tu veux</b>, au clavier ou à la voix.</li>
          <li><b>Il fait le plan et appelle l’équipe</b> : chacun file à son poste (recherche, code, design, rédaction, analyse).</li>
          <li><b>Tu les regardes bosser</b>, en vrai : chaque bulle, c’est ce que l’agent fait à cet instant.</li>
          <li><b>Ils te rendent le travail</b> : les fichiers arrivent dans « Les rendus » et dans ton dossier.</li>
        </ol>
        )}
        <p className="small muted">Ce sont de vrais agents Claude Code, qui tournent avec ton abonnement.</p>
      </section>
      <section className="card">
        <h3>Des idées de mission</h3>
        <div className="chips col">
          {(project ? PROJECT_EXAMPLES : EXAMPLES).map((e) => <button key={e.label} className="chip" onClick={() => { sfx('click'); useOffice.setState({ draft: e.prompt }); }}>{e.label}</button>)}
        </div>
      </section>
      {connection === 'live' && (
        <section className="card">
          <h3>Ton bureau</h3>
          <p className="small muted path">{tilde(dir)}</p>
          <div className="row">
            <button className="btn small" onClick={() => send({ t: 'open_root' })}>Ouvrir le dossier</button>
            <button className="btn small" onClick={() => send({ t: 'open_root', rules: true })}>Le règlement du bureau</button>
          </div>
          <p className="small muted">Le règlement, c’est ce que l’équipe doit savoir sur toi : Max le lit avant chaque mission.</p>
        </section>
      )}
      {missions.length > 0 && (
        <section className="card">
          <h3>Dernières missions</h3>
          {missions.slice(0, 4).map((m) => (
            <div key={m.id} className="mini-mission">
              <div><b>{m.title}</b><span className="small muted">{m.project ? `🛠️ ${m.project} · ` : ''}{fmtDate(m.createdAt)} · {fmtDuration(m.workMs)} · {m.files.length} rendu{m.files.length > 1 ? 's' : ''}</span></div>
              <div className="row">
                <button className="btn small" title="Rouvre la conversation : son récap, ses fichiers, et tu peux la continuer" onClick={() => { sfx('click'); send({ t: 'resume', missionId: m.id }); }}>Ouvrir</button>
                <button className="btn small ghost" onClick={() => { sfx('click'); send({ t: 'replay', missionId: m.id }); }}>Rejouer</button>
                <button className="btn small ghost" onClick={() => send({ t: 'open', missionId: m.id })}>Dossier</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function PlanSection() {
  const plan = useOffice((s) => s.plan);
  if (!plan.length) return null;
  const done = plan.filter((p) => p.status === 'completed').length;
  return (
    <section className="card">
      <h3>Le plan <span className="count">{done}/{plan.length}</span></h3>
      <ul className="plan">
        {plan.map((p, i) => <li key={i} className={p.status}><i />{p.text}</li>)}
      </ul>
    </section>
  );
}

function TeamSection() {
  const team = useOffice(useShallow(teamList));
  const [open, setOpen] = useState<string | null>(null);
  if (!team.length) {
    return (
      <section className="card">
        <h3>L’équipe</h3>
        <p className="small muted">Max lit ta demande et choisit qui appeler…</p>
      </section>
    );
  }
  const active = team.filter((a) => a.status === 'working' || a.status === 'reporting').length;
  return (
    <section className="card">
      <h3>L’équipe <span className="count">{active ? `${active} au travail` : `${team.length} passé${team.length > 1 ? 's' : ''}`}</span></h3>
      <div className="team">
        {team.map((a) => <AgentCard key={a.id} a={a} open={open === a.id} onToggle={() => { sfx('open'); setOpen(null); useOffice.setState({ modal: { kind: 'agent', id: a.id } }); }} />)}
      </div>
    </section>
  );
}

/** « 12 outils · 48 k tokens · 2 min 10 s » (mode technique). */
export function agentStats(a: AgentView): string {
  const tools = a.tools || a.acts.length;
  const ms = (a.leftAt ?? Date.now()) - a.hiredAt;
  return [
    `${tools} outil${tools > 1 ? 's' : ''}`,
    a.tokens ? `${a.tokens >= 1000 ? `${(a.tokens / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : a.tokens} tokens` : '',
    fmtDuration(ms),
  ].filter(Boolean).join(' · ');
}

function AgentCard({ a, open, onToggle }: { a: AgentView; open: boolean; onToggle: () => void }) {
  const role = roleInfo(a.role);
  const working = a.status === 'working' || a.status === 'reporting';
  const report = useMemo(() => (open && a.report ? mdToHtml(a.report) : ''), [open, a.report]);
  const tech = useOffice(techOf);
  const now = a.act ? (tech ? tidy(techLabel(a.act.tool, a.act.raw, a.act.detail)) : a.act.label) : 'S’installe à son bureau…';
  return (
    <div className={`agent ${a.status} ${open ? 'open' : ''}`} style={{ ['--c' as string]: role.color }}>
      <button className="agent-head" onClick={onToggle}>
        <Avatar role={a.role} size={30} />
        <div className="agent-id">
          <b>{a.name} <span>{role.icon} {role.label}</span></b>
          <span className="agent-task">{a.task}</span>
          <span className={`agent-now ${tech ? 'mono' : ''}`}>{working ? now : `${STATUS[a.status]}${a.leftAt ? ` · ${fmtDuration(a.leftAt - a.hiredAt)}` : ''}`}</span>
          {tech && <span className="agent-tech">{agentStats(a)}</span>}
        </div>
        <span className={`agent-status ${a.status}`} />
      </button>
      {open && (
        <div className="agent-more">
          <h4>Sa mission (écrite par Max)</h4>
          {tech ? <PromptBox prompt={a.prompt} /> : <p className="brief">{a.prompt}</p>}
          {tech && a.acts.length > 0 && (
            <>
              <h4>Ce qu’il a fait</h4>
              <TechActs acts={a.acts} max={14} />
            </>
          )}
          {!tech && a.acts.length > 0 && (
            <>
              <h4>Ce qu’il a fait</h4>
              <ul className="acts">
                {a.acts.slice(-14).map((x) => <li key={x.id} title={x.detail}>{x.ok === false ? '⚠️ ' : ''}{x.label}</li>)}
              </ul>
            </>
          )}
          {report && (
            <>
              <h4>Son rapport</h4>
              <div className="md" dangerouslySetInnerHTML={{ __html: report }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function FileList() {
  const files = useOffice((s) => s.files);
  const mission = useOffice((s) => s.mission);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  if (!mission) return null;
  return <FileActions files={files} missionId={mission.id} disabled={replaying} send={send} />;
}

function FilesSection() {
  const files = useOffice((s) => s.files.length);
  const mission = useOffice((s) => s.mission);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  return (
    <section className="card">
      <h3>{mission?.project ? 'Les fichiers modifiés' : 'Les rendus'} <span className="count">{files}</span></h3>
      {mission?.project && (
        <p className="small muted">
          🛠️ {mission.project}{mission.branch ? <> · 🌿 <code>{mission.branch}</code> (partie de <code>{mission.baseBranch}</code>)</> : ' · pas de dépôt git'}
        </p>
      )}
      {files ? <FileList /> : <p className="small muted">{mission?.project ? 'Les fichiers que l’équipe modifie arriveront ici.' : 'Les fichiers de l’équipe arriveront ici (et dans le dossier de la mission).'}</p>}
      {mission && !replaying && <button className="btn small ghost" onClick={() => send({ t: 'open', missionId: mission.id })}>{mission.project ? 'Ouvrir le projet' : 'Ouvrir le dossier de la mission'}</button>}
    </section>
  );
}

function FeedSection() {
  const feed = useOffice((s) => s.feed);
  const tech = useOffice(techOf);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [feed.length]);
  return (
    <section className="card">
      <h3>En direct</h3>
      <div className="feed" ref={box}>
        {feed.slice(-60).map((l) => (
          <div key={l.id} className={`feed-line ${l.kind}`}>
            <span className="feed-time">{new Date(l.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <b>{l.who}</b> {tech && l.tech ? <code className="feed-tech">{tidy(l.tech)}</code> : tidy(l.kind === 'chef' || l.kind === 'user' ? l.text.slice(0, 220) : l.text)}
          </div>
        ))}
      </div>
    </section>
  );
}
