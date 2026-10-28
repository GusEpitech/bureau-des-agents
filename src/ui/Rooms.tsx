// Les fenêtres qu'on ouvre en cliquant dans le bureau. Tout y vient de Claude Code, pour de vrai :
// la fiche d'un agent (sa mission, chacune de ses actions, son rapport), le plan de Max et son
// historique, l'équipe et ses outils, la machine, les rendus et l'aperçu des sites créés.
import { useEffect, useMemo, useState } from 'react';
import { ROLE_TOOLS, ROLES, roleInfo, TOOL_INFO } from '../../shared/activity.ts';
import type { McpServer, PlanItem, Role, TeamEntry } from '../../shared/protocol.ts';
import { jukebox, TRACKS } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import { world } from '../engine/instance.ts';
import { savePref, teamList, techOf, useOffice, type ActView, type Tod } from '../state/store.ts';
import { useShallow } from 'zustand/react/shallow';
import { fileIcon, fmtClock, fmtDate, fmtDuration, fmtSize, fmtTokens, plural, readable, tilde } from './format.ts';
import { party } from './interact.ts';
import { mdToHtml } from './md.ts';
import { agentStats, Avatar } from './Panel.tsx';
import { techLabel } from './tech.ts';
import { PromptBox, TechActs } from './Tech.tsx';
import { tidy } from './tidy.ts';
import { Px, ico } from './Px.tsx';

const ICON: Record<string, string> = {
  search: '🔎', web: '🌐', read: '📖', write: '✍️', edit: '✏️', bash: '💻', plan: '📋', skill: '🎓', mcp: '🔌', other: '⚙️',
};

function Shell({ title, sub, wide, children, onClose }: { title: React.ReactNode; sub?: React.ReactNode; wide?: boolean; children: React.ReactNode; onClose?: () => void }) {
  const close = onClose ?? (() => useOffice.setState({ modal: null }));
  return (
    <div className="modal-back" onClick={close}>
      <div className={`modal room ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="room-title"><b>{title}</b>{sub && <span>{sub}</span>}</div>
          <button className="close" onClick={close} aria-label="Fermer">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Les fenêtres du bureau (une seule ouverte à la fois). */
export function Rooms() {
  const modal = useOffice((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'agent': return <AgentRoom id={modal.id} />;
    case 'board': return <BoardRoom />;
    case 'clock': return <ClockRoom />;
    case 'machine': return <MachineRoom />;
    case 'jukebox': return <JukeboxRoom />;
    case 'team': return <TeamRoom role={modal.role} />;
    case 'files': return <FilesRoom />;
    case 'preview': return <PreviewRoom missionId={modal.missionId} file={modal.file} />;
  }
}

// ── La fiche d'un agent ──
function AgentRoom({ id }: { id: string }) {
  const a = useOffice((s) => s.agents[id]);
  const tech = useOffice(techOf);
  const live = world.actors.get(id);
  const html = useMemo(() => (a?.report ? mdToHtml(tidy(a.report)) : ''), [a?.report]);
  if (!a) return <Shell title="Cet agent n’est plus là">Il a quitté le bureau.</Shell>;
  const role = roleInfo(a.role);
  const working = a.status === 'working' || a.status === 'reporting';
  return (
    <Shell title={<>{a.name}</>} sub={<><Px e={role.icon} /> {role.label} · {a.task}</>}>
      <div className="agent-hero" style={{ ['--c' as string]: role.color }}>
        <Avatar role={a.role} size={72} />
        <div>
          <span className={`pill-status ${a.status}`}>{working ? (live?.seated ? 'Au travail' : 'En chemin') : a.status === 'done' ? 'A rendu son travail' : 'N’a pas pu finir'}</span>
          <p className="now">{working && a.act ? <><i><Px e={ICON[a.act.kind]} /></i>{tech ? <code>{tidy(techLabel(a.act.tool, a.act.raw, a.act.detail))}</code> : a.act.label}</> : a.status === 'done' ? 'Son rapport est sur le bureau de Max.' : working ? 'Il s’installe à son poste…' : ''}</p>
          <p className="small muted">Un vrai sous-agent Claude Code (« {role.type || 'renfort'} »), avec ses propres outils : {ROLE_TOOLS[a.role].join(', ') || 'ceux de Max'}.</p>
        </div>
      </div>
      <section className="room-sec">
        <h4>Sa mission, écrite par Max</h4>
        {tech ? <PromptBox prompt={a.prompt} /> : <p className="brief">{tidy(a.prompt)}</p>}
        {tech && <p className="agent-tech">{agentStats(a)}</p>}
      </section>
      {a.acts.length > 0 && (
        <section className="room-sec">
          <h4>Ce qu’il a fait <span className="count">{plural(a.acts.length, 'action', 'actions')}</span></h4>
          {tech ? <TechActs acts={a.acts} /> : <ActList acts={a.acts} />}
        </section>
      )}
      {html && (
        <section className="room-sec">
          <h4>Son rapport</h4>
          <div className="md report" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      )}
      {a.leftAt && (
        <>
        <p className="small muted">{fmtDuration(a.leftAt - a.hiredAt)} de travail{a.tools ? ` · ${plural(a.tools, 'outil utilisé', 'outils utilisés')}` : ''}{a.tokens ? ` · ${a.tokens.toLocaleString('fr-FR')} jetons` : ''}</p>
        {a.use && (
          <p className="small muted agent-use" title="Ce que cet agent a lu, écrit et réfléchi. Le cache, c'est ce qu'il relit à chaque message : peu cher, mais ça compte.">
            A écrit {fmtTokens(a.use.output)}{a.use.thinking ? ` (dont ${fmtTokens(a.use.thinking)} de réflexion)` : ''} · a relu {fmtTokens(a.use.cacheRead + a.use.cacheWrite + a.use.input)}{a.use.model ? ` · ${a.use.model.replace(/^claude-/, '')}` : ''}
          </p>
        )}
        </>
      )}
    </Shell>
  );
}

function ActList({ acts }: { acts: ActView[] }) {
  return (
    <ul className="act-list">
      {acts.slice(-40).map((x) => (
        <li key={x.id} className={x.ok === false ? 'fail' : ''}>
          <i><Px e={ICON[x.kind]} /></i>
          <div>
            <span>{x.label}</span>
            {x.detail && x.detail !== x.label && <code>{(() => { const d = tidy(x.detail); return d.length > 160 ? d.slice(0, 159) + '…' : d; })()}</code>}
          </div>
          <time>{new Date(x.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
        </li>
      ))}
    </ul>
  );
}

// ── Le tableau : le plan, qui fait quoi, et l'historique du plan ──
function planChanges(prev: PlanItem[] | null, next: PlanItem[]): string[] {
  if (!prev) return [`Max écrit le plan : ${plural(next.length, 'étape', 'étapes')}`];
  const out: string[] = [];
  for (const it of next) {
    const before = prev.find((p) => p.text === it.text);
    if (!before) out.push(`+ ${it.text}`);
    else if (before.status !== it.status && it.status === 'completed') out.push(`✓ ${it.text}`);
    else if (before.status !== it.status && it.status === 'in_progress') out.push(`▶ ${it.text}`);
  }
  return out;
}

function BoardRoom() {
  const plan = useOffice((s) => s.plan);
  const history = useOffice((s) => s.planHistory);
  const team = useOffice(useShallow(teamList));
  const done = plan.filter((p) => p.status === 'completed').length;
  const steps = useMemo(() => history.map((h, i) => ({ at: h.at, lines: planChanges(i ? history[i - 1].items : null, h.items) })).filter((x) => x.lines.length), [history]);
  return (
    <Shell title="Le tableau de Max" sub={plan.length ? `${done} étape${done > 1 ? 's' : ''} faite${done > 1 ? 's' : ''} sur ${plan.length}` : 'Le plan de la mission, et qui fait quoi'}>
      {plan.length > 0 ? (
        <>
          <div className="progress"><i style={{ width: `${(done / plan.length) * 100}%` }} /></div>
          <ul className="plan big">{plan.map((p, i) => <li key={i} className={p.status}><i />{p.text}</li>)}</ul>
        </>
      ) : <p className="muted">Pas encore de plan : Max en écrit un dès qu’une mission a plusieurs étapes.</p>}
      <section className="room-sec">
        <h4>Qui fait quoi <span className="count">{plural(team.length, 'agent', 'agents')}</span></h4>
        {team.length ? (
          <div className="who">
            {team.map((a) => (
              <button key={a.id} className={`who-row ${a.status}`} style={{ ['--c' as string]: ROLES[a.role].color }} onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'agent', id: a.id } }); }}>
                <Avatar role={a.role} size={26} />
                <b>{a.name}</b>
                <span className="who-task">{a.task}</span>
                <span className="who-state">{ico(a.status === 'done' ? '✓ rapport rendu' : a.status === 'failed' ? '✕ pas fini' : a.status === 'reporting' ? '📄 rend son rapport' : '… au travail')}</span>
              </button>
            ))}
          </div>
        ) : <p className="muted small">Personne pour l’instant.</p>}
      </section>
      {steps.length > 0 && (
        <section className="room-sec">
          <h4>L’historique du plan</h4>
          <ol className="timeline">
            {steps.map((s, i) => (
              <li key={i}>
                <time>{new Date(s.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                <div>{s.lines.map((l, j) => <span key={j}>{l}</span>)}</div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Shell>
  );
}

// ── L'horloge ──
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

const TODS: [Tod, string][] = [['auto', 'Comme ton Mac'], ['day', '☀️ Jour'], ['evening', '🌇 Soir'], ['night', '🌙 Nuit']];

function ClockRoom() {
  const now = useClock();
  const tod = useOffice((s) => s.tod);
  const busySince = useOffice((s) => s.busySince);
  const workMs = useOffice((s) => s.workMs);
  const mission = useOffice((s) => s.mission);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <Shell title="L’horloge du bureau" sub={now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
      <div className="big-clock"><span>{hh}</span><i>:</i><span>{mm}</span><small>{ss}</small></div>
      {mission && (busySince
        ? <p className="center">Mission en cours depuis <b>{fmtClock(workMs + (now.getTime() - busySince))}</b> · {mission.title}</p>
        : <p className="center">Dernière mission : <b>{fmtClock(workMs)}</b> de travail · {mission.title}</p>)}
      <p className="center muted small">Ton équipe ne dort jamais : elle travaille à 3 h du matin comme à midi.</p>
      <div className="seg">
        {TODS.map(([v, l]) => (
          <button key={v} className={tod === v ? 'on' : ''} onClick={() => { sfx('click'); useOffice.setState({ tod: v }); savePref('tod', v); }}>{ico(l)}</button>
        ))}
      </div>
    </Shell>
  );
}

// ── La machine (le serveur) : Claude Code, le modèle, l'abonnement ──
function MachineRoom() {
  const claude = useOffice((s) => s.claude);
  const settings = useOffice((s) => s.settings);
  const mission = useOffice((s) => s.mission);
  const quota = useOffice((s) => s.quota);
  const dir = useOffice((s) => s.dir);
  const connection = useOffice((s) => s.connection);
  const rows: [string, React.ReactNode][] = [
    ['Claude Code', claude?.found ? `${claude.version} · ${tilde(claude.path ?? '')}` : connection === 'demo' ? 'Démo (rediffusion d’une vraie mission)' : 'introuvable'],
    ['Connexion', 'ton abonnement Claude (aucune clé API, aucune facturation à l’usage)'],
    ['Cerveau de Max', mission?.model ? `${mission.model} (réglage : ${settings.chefModel || 'par défaut'})` : settings.chefModel || 'par défaut'],
    ['Cerveau de l’équipe', settings.teamModel === 'inherit' ? 'le même que Max' : settings.teamModel],
    ['Permissions', settings.permission === 'auto' ? 'automatiques : l’agent lève la main pour les gestes risqués' : 'demandées avant chaque commande'],
    ['Énergie (5 h)', quota ? `${Math.round(quota.fiveHour * 100)} % utilisés${quota.resetsAt ? `, rechargée à ${new Date(quota.resetsAt * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'pas encore mesurée'],
    ...(quota?.sevenDay !== undefined ? [['Énergie (7 jours)', `${Math.round(quota.sevenDay * 100)} % utilisés`] as [string, string]] : []),
    ['Dossier du bureau', dir ? tilde(dir) : '—'],
    ['Mission en cours', mission ? tilde(mission.folder) : 'aucune'],
  ];
  return (
    <Shell title="La machine" sub="Ce qui tourne derrière le bureau">
      <dl className="kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {connection === 'live' && claude?.found && <McpSection />}
      <section className="room-sec">
        <h4>Comment ça marche</h4>
        <p className="small">Max est une vraie séance Claude Code, lancée sans fenêtre dans le dossier de la mission. Son équipe, ce sont de vrais sous-agents Claude Code, chacun avec ses consignes et seulement les outils de son métier. Chaque fois qu’un agent utilise un outil (une recherche, une page lue, un fichier écrit), Claude Code le raconte au bureau, qui le montre aussitôt : un robot qui tape, une bulle, un rapport posé sur le bureau du chef.</p>
        {mission?.project
          ? <p className="small muted">Mode projet : la séance suit ta config Claude Code (tes réglages et leurs permissions, tes hooks, tes MCP, tes skills, tes agents, le CLAUDE.md du projet). Max commence chaque demande en mode plan : il explore, puis te soumet son plan avant de toucher au code.</p>
          : <p className="small muted">Mode restreint : l’équipe ne sort jamais du dossier de la mission, et ni tes réglages ni tes autres agents ne s’invitent dans le bureau.</p>}
      </section>
    </Shell>
  );
}

const MCP_STATUS: Record<McpServer['status'], string> = { ok: 'connecté', auth: 'à authentifier', pending: 'en attente d’approbation', disabled: 'désactivé', failed: 'en échec' };

/** Les connecteurs MCP : ceux de la séance de Max, ou une vérification à la demande (claude mcp list). */
function McpSection() {
  const mcp = useOffice((s) => s.mcp);
  const loading = useOffice((s) => s.mcpLoading);
  const send = useOffice((s) => s.send);
  const check = () => { sfx('click'); useOffice.setState({ mcpLoading: true }); send({ t: 'mcp_list' }); };
  // pas encore de liste : on vérifie en ouvrant la fenêtre
  useEffect(() => { if (!useOffice.getState().mcp && !useOffice.getState().mcpLoading) check(); }, []);
  const servers = mcp ? [...mcp.servers].sort((a, b) => Number(a.status !== 'ok') - Number(b.status !== 'ok') || a.name.localeCompare(b.name)) : [];
  const ok = servers.filter((x) => x.status === 'ok').length;
  return (
    <section className="room-sec">
      <div className="mcp-head">
        <h4>Les connecteurs MCP {mcp && !mcp.error && <span className="muted small">{ok}/{servers.length} connectés</span>}</h4>
        <button className="btn small ghost" disabled={loading} onClick={check}>{loading ? 'Vérification…' : 'Vérifier'}</button>
      </div>
      {mcp && (
        <p className="small muted">
          {mcp.from === 'session' ? 'Chargés dans la séance de Max' : `Vérifiés dans ${mcp.place ?? 'le bureau'}`}, à {new Date(mcp.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}
      {mcp?.error && <p className="small mcp-error">{tidy(mcp.error)}</p>}
      {!mcp && loading && <p className="small muted">Je demande à Claude Code ses connecteurs (quelques secondes)…</p>}
      {mcp && !mcp.error && !servers.length && <p className="small muted">Aucun connecteur MCP. Ajoute-en avec « claude mcp add », ou depuis claude.ai.</p>}
      {servers.length > 0 && (
        <ul className="mcp-list">
          {servers.map((x) => (
            <li key={`${x.source}:${x.name}`} className={x.status}>
              <i className="mcp-dot" title={x.label} />
              <b>{x.name}</b>
              {x.source === 'claude.ai' && <em className="mcp-tag">claude.ai</em>}
              <span className="muted">{[x.where, x.tools ? `${x.tools} outil${x.tools > 1 ? 's' : ''}` : '', MCP_STATUS[x.status]].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      {servers.some((x) => x.status === 'auth') && <p className="small muted">Un connecteur « à authentifier » se connecte dans Claude Code : lance « claude », puis /mcp.</p>}
    </section>
  );
}

// ── Le jukebox ──
function JukeboxRoom() {
  const music = useOffice((s) => s.music);
  const tr = TRACKS[music.index];
  return (
    <Shell title="Le jukebox" sub="De la house pour bosser (ou pour l’afterwork)">
      <div className="now-playing">
        <div className={`vinyl ${music.playing ? 'spin' : ''}`}><i /></div>
        <div>
          <b>{tr.title}</b>
          <span>{tr.mood}</span>
          <div className="row">
            <button className="btn small" onClick={() => jukebox.prev()} aria-label="Morceau précédent">⏮</button>
            <button className="btn primary small" onClick={() => jukebox.toggle()}>{music.playing ? '⏸ Pause' : '▶ Lecture'}</button>
            <button className="btn small" onClick={() => jukebox.next()} aria-label="Morceau suivant">⏭</button>
          </div>
        </div>
      </div>
      <label className="field volume">
        <span>Volume</span>
        <input type="range" min={0} max={1} step={0.01} value={music.volume} onChange={(e) => jukebox.setVolume(Number(e.target.value))} />
      </label>
      <ul className="tracks">
        {TRACKS.map((t, i) => (
          <li key={t.id}>
            <button className={i === music.index ? 'on' : ''} onClick={() => jukebox.play(i)}>
              <span>{i === music.index && music.playing ? '♪' : i + 1}</span>
              <b>{t.title}</b>
              <em>{t.mood}</em>
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" onClick={() => { useOffice.setState({ modal: null }); party(); }}><Px e="🪩" /> Mode soirée</button>
        <span className="small muted">Morceaux originaux, composés pour le bureau avec ElevenLabs Music et Google Lyria.</span>
      </div>
    </Shell>
  );
}

/** Qui a consommé quoi : la part des tokens de chaque métier, et un conseil quand l'exploration en prend la moitié. */
function TokenShare({ team }: { team: ReturnType<typeof teamList> }) {
  const done = team.filter((a) => a.tokens > 0);
  const total = done.reduce((n, a) => n + a.tokens, 0);
  if (!total) return null;
  const by = new Map<Role, number>();
  for (const a of done) by.set(a.role, (by.get(a.role) ?? 0) + a.tokens);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const top = rows[0];
  return (
    <div className="tok-share">
      <div className="tok-head"><b>{fmtTokens(total)} tokens</b> consommés par l’équipe jusqu’ici</div>
      <div className="tok-bar">{rows.map(([r, n]) => <i key={r} style={{ flex: n, background: ROLES[r].color }} title={`${roleInfo(r).label} : ${fmtTokens(n)} tokens`} />)}</div>
      <div className="tok-legend">{rows.map(([r, n]) => <span key={r} style={{ ['--c' as string]: ROLES[r].color }}><Px e={roleInfo(r).icon} /> {roleInfo(r).label} {Math.round((n / total) * 100)} %</span>)}</div>
      {top[0] === 'recherche' && top[1] / total >= 0.5 && <p className="small muted">L’exploration lit beaucoup de code : un modèle plus léger (Haiku) ou un effort faible, dans Réglages › Économiser des tokens, coûte nettement moins.</p>}
    </div>
  );
}

/** Le bilan sur plusieurs missions : qui consomme quoi, par métier, par projet et par semaine. */
function UsageTab() {
  const usage = useOffice((s) => s.usage);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  const [days, setDays] = useState(30);
  useEffect(() => { if (connection === 'live') send({ t: 'stats', days }); }, [days, connection, send]);
  if (connection !== 'live') return <p className="muted">Le bilan vit sur ton ordinateur : lance le bureau avec Claude Code pour le voir.</p>;
  const periods: [number, string][] = [[7, '7 jours'], [30, '30 jours'], [0, 'Tout']];
  const pick = (
    <div className="seg usage-days">
      {periods.map(([d, l]) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{l}</button>)}
    </div>
  );
  if (!usage || usage.days !== days) return <>{pick}<p className="muted">Chargement…</p></>;
  const total = usage.team + usage.chef;
  if (!usage.missions || !total) return <>{pick}<p className="muted">Rien à compter sur cette période. Les chiffres viennent des missions terminées.</p></>;
  const maxWeek = Math.max(...usage.byWeek.map((w) => w.tokens), 1);
  const maxProject = Math.max(...usage.byProject.map((p) => p.tokens), 1);
  return (
    <>
      {pick}
      <div className="usage-kpis">
        <div><b>{fmtTokens(total)}</b><span>tokens au total</span></div>
        <div><b>{plural(usage.missions, 'mission', 'missions')}</b><span>{fmtTokens(Math.round(total / usage.missions))} en moyenne</span></div>
        <div><b>{Math.round((usage.team / total) * 100)} %</b><span>pour l’équipe, {100 - Math.round((usage.team / total) * 100)} % pour Max</span></div>
        {usage.costUsd > 0 && <div><b>{usage.costUsd.toFixed(2)} $</b><span>coût indicatif de Max</span></div>}
      </div>
      {usage.byRole.length > 0 && (
        <section className="usage-block">
          <h4>Par métier <small>(les agents)</small></h4>
          {usage.byRole.map((r) => (
            <div key={r.role} className="usage-row" style={{ ['--c' as string]: ROLES[r.role].color }}>
              <span><Px e={roleInfo(r.role).icon} /> {roleInfo(r.role).label}</span>
              <i><u style={{ width: `${Math.max(2, (r.tokens / Math.max(usage.team, 1)) * 100)}%` }} /></i>
              <em title={r.thinking ? `${fmtTokens(r.output)} écrits dont ${fmtTokens(r.thinking)} de réflexion` : undefined}>{fmtTokens(r.tokens)} · {plural(r.agents, 'passage', 'passages')}{r.thinking ? ` · ${Math.round((r.thinking / Math.max(r.output, 1)) * 100)} % réflexion` : ''}</em>
            </div>
          ))}
        </section>
      )}
      {usage.byProject.length > 0 && (
        <section className="usage-block">
          <h4>Par projet</h4>
          {usage.byProject.map((p) => (
            <div key={p.project} className="usage-row">
              <span title={p.project || 'Missions libres'}>{ico(p.project ? `🛠️ ${p.project}` : '📁 Missions libres')}</span>
              <i><u style={{ width: `${Math.max(2, (p.tokens / maxProject) * 100)}%` }} /></i>
              <em>{fmtTokens(p.tokens)} · {plural(p.missions, 'mission', 'missions')}</em>
            </div>
          ))}
        </section>
      )}
      {usage.byWeek.length > 1 && (
        <section className="usage-block">
          <h4>Par semaine</h4>
          <div className="usage-weeks">
            {usage.byWeek.map((w) => (
              <div key={w.week} title={`Semaine du ${fmtDate(w.week)} : ${fmtTokens(w.tokens)} tokens, ${plural(w.missions, 'mission', 'missions')}`}>
                <i style={{ height: `${Math.max(4, (w.tokens / maxWeek) * 100)}%` }} />
                <small>{new Date(w.week).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}</small>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="usage-block">
        <h4>Les missions les plus gourmandes</h4>
        {usage.top.map((t) => (
          <button key={t.missionId} className="usage-top" onClick={() => { sfx('click'); send({ t: 'resume', missionId: t.missionId }); useOffice.setState({ modal: null }); }}>
            <span>{t.title}</span><em>{fmtTokens(t.tokens)}</em>
          </button>
        ))}
      </section>
    </>
  );
}

/** Qui est passé au bureau : mission par mission, avec ce que chacun a rendu et consommé. */
function TeamHistory() {
  const history = useOffice((s) => s.teamHistory);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  const currentId = useOffice((s) => s.mission?.id ?? null);
  const busy = useOffice((s) => s.busySince !== null);
  const [role, setRole] = useState<Role | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (connection === 'live') send({ t: 'team_history' }); }, [connection, send]);
  const shown = useMemo(() => (history ?? []).filter((e) => !role || e.role === role), [history, role]);
  const missions = useMemo(() => {
    const m = new Map<string, { title: string; at: number; entries: TeamEntry[] }>();
    for (const e of shown) {
      if (!m.has(e.missionId)) m.set(e.missionId, { title: e.missionTitle, at: e.at, entries: [] });
      m.get(e.missionId)!.entries.push(e);
    }
    return [...m.entries()];
  }, [shown]);
  const roles = useMemo(() => {
    const n = new Map<Role, number>();
    for (const e of history ?? []) n.set(e.role, (n.get(e.role) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [history]);
  if (connection !== 'live') return <p className="muted">L’historique vit sur ton ordinateur : lance le bureau avec Claude Code pour le voir.</p>;
  if (!history) return <p className="muted">Chargement…</p>;
  if (!history.length) return <p className="muted">Personne n’est encore passé au bureau. Donne une mission à Max : ses agents apparaîtront ici.</p>;
  const total = shown.reduce((n, e) => n + e.tokens, 0);
  return (
    <div className="hist-team">
      <p className="team-sum">
        <b>{plural(shown.length, 'passage', 'passages')}</b>
        <span className="sum">sur {plural(missions.length, 'mission', 'missions')}</span>
        {total > 0 && <span className="sum">{fmtTokens(total)} tokens</span>}
      </p>
      {roles.length > 1 && (
        <div className="chips">
          <button className={`chip ${role === null ? 'on' : ''}`} onClick={() => setRole(null)}>Tous</button>
          {roles.map(([r, n]) => (
            <button key={r} className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(role === r ? null : r)}><Px e={roleInfo(r).icon} /> {roleInfo(r).label} <span className="count">{n}</span></button>
          ))}
        </div>
      )}
      {missions.map(([id, m], i) => {
        const tokens = m.entries.reduce((n, e) => n + e.tokens, 0);
        const failed = m.entries.filter((e) => e.status === 'failed').length;
        return (
          <details key={id} className="th-mission" open={i < 2 || !!role}>
            <summary>
              <span className="th-title">{m.title}</span>
              <span className="th-meta">
                {fmtDate(m.at)} · {plural(m.entries.length, 'agent', 'agents')}{tokens > 0 ? ` · ${fmtTokens(tokens)}` : ''}
                {failed > 0 && <b className="th-failed"> · {failed} pas fini{failed > 1 ? 's' : ''}</b>}
              </span>
              <button className="btn small ghost" title="Rouvre cette mission dans la conversation" onClick={(e) => { e.preventDefault(); sfx('click'); send({ t: 'resume', missionId: id }); useOffice.setState({ modal: null }); }}>Ouvrir</button>
            </summary>
            {m.entries.map((e) => {
              // sans « départ » enregistré : interrompu, sauf si c'est la mission qui tourne en ce moment
              const status = e.status === 'working' && !(id === currentId && busy) ? 'cut' : e.status;
              const isOpen = open === `${id}/${e.id}`;
              return (
                <div key={e.id} className={`th-row ${status}`} style={{ ['--c' as string]: ROLES[e.role].color }}>
                  <button aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `${id}/${e.id}`)}>
                    <Avatar role={e.role} size={22} />
                    <span className="th-who"><b>{e.name}</b><small>{roleInfo(e.role).label} · {e.task}</small></span>
                    <span className="th-nums">{e.tokens ? `${fmtTokens(e.tokens)} tokens` : ''}{e.tokens && e.ms ? ' · ' : ''}{e.ms ? fmtDuration(e.ms) : ''}</span>
                    <span className={`th-state ${status}`}>{status === 'done' ? '✓ rendu' : status === 'failed' ? '✕ pas fini' : status === 'cut' ? 'interrompu' : '… au travail'}</span>
                  </button>
                  {isOpen && (
                    <div className="th-detail">
                      <p className="small muted">{e.task}</p>
                      {e.use && (
                        <p className="small muted" title="Ce qu'il a écrit, la part passée à réfléchir, et ce qu'il a relu (le cache est peu cher, mais ça compte).">
                          A écrit {fmtTokens(e.use.output)}{e.use.thinking ? ` (dont ${fmtTokens(e.use.thinking)} de réflexion)` : ''} · a relu {fmtTokens(e.use.cacheRead + e.use.cacheWrite + e.use.input)}{e.tools ? ` · ${plural(e.tools, 'outil', 'outils')}` : ''}{e.use.model ? ` · ${e.use.model.replace(/^claude-/, '')}` : ''}
                        </p>
                      )}
                      {e.report ? <div className="md small" dangerouslySetInnerHTML={{ __html: mdToHtml(tidy(e.report)) }} /> : <p className="small muted">Pas de rapport enregistré pour ce passage.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}

// ── Toute l'équipe : les métiers et leurs outils, la mission en cours, l'historique ──
function TeamRoom({ role }: { role?: Role }) {
  const [tab, setTab] = useState<'roles' | 'now' | 'history' | 'usage'>(role ? 'roles' : 'now');
  const team = useOffice(useShallow(teamList));
  const settings = useOffice((s) => s.settings);
  const working = (r: Role) => [...world.actors.values()].filter((a) => a.role === r && a.seated).length;
  const roles: Role[] = ['chef', 'recherche', 'code', 'design', 'redaction', 'analyse'];
  return (
    <Shell title="Toute l’équipe" sub="De vrais agents Claude Code, chacun avec son métier et ses outils" wide>
      <div className="seg tabs">
        <button className={tab === 'now' ? 'on' : ''} onClick={() => setTab('now')}>Cette mission</button>
        <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Les métiers</button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>L’historique</button>
        <button className={tab === 'usage' ? 'on' : ''} onClick={() => setTab('usage')}>Le bilan</button>
      </div>
      {tab === 'now' && (team.length ? (
        <>
          <p className="team-sum">
            <b>{plural(team.length, 'agent', 'agents')}</b>
            {team.some((a) => a.status === 'working' || a.status === 'reporting') && <span className="sum working">{team.filter((a) => a.status === 'working' || a.status === 'reporting').length} au travail</span>}
            {team.some((a) => a.status === 'done') && <span className="sum done">{team.filter((a) => a.status === 'done').length} ont rendu leur rapport</span>}
            {team.some((a) => a.status === 'failed') && <span className="sum failed">{team.filter((a) => a.status === 'failed').length} n’ont pas fini</span>}
          </p>
          <TokenShare team={team} />
          <div className="who">
            {team.map((a) => (
              <button key={a.id} className={`who-row ${a.status}`} style={{ ['--c' as string]: ROLES[a.role].color }} title="Voir son travail" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'agent', id: a.id } }); }}>
                <Avatar role={a.role} size={26} />
                <span className="who-id"><b>{a.name}</b><small><Px e={roleInfo(a.role).icon} /> {roleInfo(a.role).label}{a.tokens ? ` · ${fmtTokens(a.tokens)} tokens` : ''}</small></span>
                <span className="who-task">{a.task}</span>
                <span className={`who-state ${a.status}`}>{a.status === 'done' ? '✓ rapport rendu' : a.status === 'failed' ? '✕ pas fini' : a.act ? a.act.label : '… au travail'}</span>
              </button>
            ))}
          </div>
        </>
      ) : <p className="muted">Personne au bureau pour l’instant. Donne une mission à Max : il appellera les bons agents.</p>)}
      {tab === 'roles' && (
        <div className="roles">
          {roles.map((r) => {
            const brain = r === 'chef' ? settings.chefModel || 'par défaut' : (settings.roleModels[r] ?? settings.teamModel) === 'inherit' ? 'comme Max' : settings.roleModels[r] ?? settings.teamModel;
            return (
              <div key={r} className={`role-card ${role === r ? 'focus' : ''}`} style={{ ['--c' as string]: ROLES[r].color }}>
                <div className="role-head">
                  <Avatar role={r} size={34} />
                  <div><b><Px e={roleInfo(r).icon} /> {roleInfo(r).label}</b><span>{r === 'chef' ? 'Max, le chef' : `agent « ${roleInfo(r).type} »`}</span></div>
                </div>
                <p>{roleInfo(r).what}</p>
                <div className="role-meta">
                  <span className="chip-brain" title="Le modèle de ce métier (réglable dans les réglages)"><Px e="🧠" /> {brain}</span>
                  <span className="muted small">{ROLE_TOOLS[r].length} outils</span>
                  {working(r) > 0 && <em className="role-busy">{working(r)} au travail</em>}
                </div>
                <div className="role-tools">{ROLE_TOOLS[r].map((t) => <span key={t} title={`${t} : ${TOOL_INFO[t] ?? ''}`}>{t}</span>)}</div>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'usage' && <UsageTab />}
      {tab === 'history' && <TeamHistory />}
    </Shell>
  );
}

// ── L'imprimante : les rendus de la mission ──
function FilesRoom() {
  const files = useOffice((s) => s.files);
  const mission = useOffice((s) => s.mission);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  if (!mission || !files.length) {
    return <Shell title="Les rendus" sub="L’imprimante du bureau"><p className="muted">Rien d’imprimé pour l’instant : les fichiers de l’équipe arriveront ici.</p></Shell>;
  }
  return (
    <Shell title="Les rendus" sub={`${plural(files.length, 'fichier', 'fichiers')} · ${mission.title}`}>
      <FileActions files={files} missionId={mission.id} disabled={replaying} send={send} />
    </Shell>
  );
}

export function FileActions({ files, missionId, disabled, send }: { files: ReturnType<typeof useOffice.getState>['files']; missionId: string; disabled: boolean; send: ReturnType<typeof useOffice.getState>['send'] }) {
  const agents = useOffice((s) => s.agents);
  return (
    <div className="files">
      {files.map((f) => (
        <div key={f.path} className="file">
          <span className="file-icon"><Px e={fileIcon(f.ext)} /></span>
          <div className="file-id">
            <b title={f.path}>{f.name}</b>
            <span className="small muted">{fmtSize(f.size)} · par {f.by === 'chef' ? 'Max' : agents[f.by]?.name ?? 'l’équipe'}</span>
          </div>
          {!disabled && (f.ext === 'html' || f.ext === 'htm') && (
            <button className="btn small primary" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'preview', missionId, file: f.path } }); }}>Voir le site</button>
          )}
          {!disabled && readable(f.ext) && (
            <button className="btn small" onClick={() => { sfx('open'); useOffice.setState({ modal: null, viewer: { missionId, file: f.path } }); send({ t: 'read', missionId, file: f.path }); send({ t: 'versions', missionId, file: f.path }); }}>Lire</button>
          )}
          {!disabled && <button className="btn small ghost" onClick={() => send({ t: 'open', missionId, file: f.path })}>Ouvrir</button>}
        </div>
      ))}
    </div>
  );
}

// ── L'aperçu d'un site fait par l'équipe, dans un écran (bac à sable : il ne peut rien toucher) ──
function PreviewRoom({ missionId, file }: { missionId: string; file: string }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [nonce, setNonce] = useState(0);
  const send = useOffice((s) => s.send);
  const src = `/apercu/${encodeURIComponent(missionId)}/${file.split('/').map(encodeURIComponent).join('/')}`;
  const close = () => useOffice.setState({ modal: null });
  return (
    <div className="modal-back" onClick={close}>
      <div className="monitor" onClick={(e) => e.stopPropagation()}>
        <div className="monitor-bar">
          <span className="dots"><i /><i /><i /></span>
          <span className="addr"><Px e="🔒" /> {file}</span>
          <div className="seg small">
            <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}><Px e="💻" /> Ordinateur</button>
            <button className={device === 'phone' ? 'on' : ''} onClick={() => setDevice('phone')}><Px e="📱" /> Téléphone</button>
          </div>
          <button className="btn small" onClick={() => setNonce((n) => n + 1)} title="Recharger">↻</button>
          <button className="btn small" title="Le code de la page, et ses versions successives" onClick={() => { useOffice.setState({ modal: null, viewer: { missionId, file } }); send({ t: 'read', missionId, file }); send({ t: 'versions', missionId, file }); }}>&lt;/&gt; Code et versions</button>
          <button className="btn small" onClick={() => send({ t: 'open', missionId, file })}>Ouvrir dans le navigateur</button>
          <button className="close" onClick={close} aria-label="Fermer">×</button>
        </div>
        <div className={`monitor-screen ${device}`}>
          <iframe key={nonce} title={file} src={src} sandbox="allow-scripts allow-forms allow-popups allow-modals" referrerPolicy="no-referrer" />
        </div>
      </div>
    </div>
  );
}
