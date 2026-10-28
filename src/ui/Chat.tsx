// La conversation avec Max, du début à la fin : tes demandes, ses réponses, qui il appelle, et ses récaps.
// Elle reste là après la mission (et après un redémarrage du bureau) : on la relit, et on la continue.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '../audio/sfx.ts';
import { techOf, useOffice, type ChatMsg } from '../state/store.ts';
import { usageLine } from './tech.ts';
import { ToolGroup } from './Tech.tsx';
import { copyText, mdToHtml } from './md.ts';
import { tidy } from './tidy.ts';

const time = (at: number) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const Message = memo(function Message({ m, tech }: { m: ChatMsg; tech: boolean }) {
  const usage = tech && (m.usage || m.ms) ? usageLine(m.usage, m.ms) : '';
  const html = useMemo(() => (m.kind === 'chef' || m.kind === 'final' ? mdToHtml(tidy(m.text)) : ''), [m.kind, m.text]);
  if (m.kind === 'plan') return <PlanMessage m={m} />;
  if (m.kind === 'note') return <div className="chat-note">{tidy(m.text)}{usage && <div className="chat-usage">{usage}</div>}</div>;
  if (m.kind === 'error') return <div className="chat-note error">⚠️ {tidy(m.text)}</div>;
  if (m.kind === 'user') {
    return (
      <div className="chat-msg user">
        <div className="chat-who">Toi <span>{time(m.at)}</span></div>
        <div className="chat-bubble">{m.text}</div>
      </div>
    );
  }
  return (
    <div className={`chat-msg chef ${m.kind === 'final' ? 'recap' : ''}`}>
      <div className="chat-who">
        Max <span>{time(m.at)}</span>
        {m.kind === 'final' && <em className={m.ok === false ? 'ko' : ''}>{m.ok === false ? 'Arrêté' : 'Récap'}</em>}
        <button type="button" className="chat-copy" title="Copier le message (en markdown)" onClick={(e) => copyText(m.text, e.currentTarget)}>Copier</button>
      </div>
      <div className="chat-bubble md" dangerouslySetInnerHTML={{ __html: html }} />
      {usage && <div className="chat-usage">{usage}</div>}
    </div>
  );
});

/** Les messages, avec les appels d'outils qui se suivent regroupés (mode technique) ou cachés (sinon). */
function group(chat: ChatMsg[], tech: boolean): (ChatMsg | ChatMsg[])[] {
  const out: (ChatMsg | ChatMsg[])[] = [];
  for (const m of chat) {
    if (m.kind !== 'tool') { out.push(m); continue; }
    // le plan de Max a son propre message : pas de ligne technique en double
    if (!tech || m.act?.tool === 'ExitPlanMode') continue;
    const last = out[out.length - 1];
    if (Array.isArray(last)) last.push(m); else out.push([m]);
  }
  return out;
}

const PLAN_STATE: Record<NonNullable<ChatMsg['plan']>, string> = {
  pending: 'À valider', approved: 'Validé', changes: 'Changements demandés', cancelled: 'Abandonné',
};

/** Le plan de Max (mode projet) : tu le valides avant qu'il code, ou tu demandes des changements. */
function PlanMessage({ m }: { m: ChatMsg }) {
  const html = useMemo(() => mdToHtml(tidy(m.text)), [m.text]);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const state = m.plan ?? 'pending';
  const live = state === 'pending' && !replaying && !!m.requestId;
  const approve = () => { sfx('yes'); send({ t: 'answer', requestId: m.requestId!, allow: true }); };
  const changes = () => {
    if (!note.trim()) return;
    sfx('no');
    send({ t: 'answer', requestId: m.requestId!, allow: false, message: note.trim() });
    setNote('');
    setEditing(false);
  };
  return (
    <div className={`chat-msg chef plan-msg ${state}`}>
      <div className="chat-who">
        📝 Plan de Max <span>{time(m.at)}</span>
        <em className={`plan-state ${state}`}>{PLAN_STATE[state]}</em>
      </div>
      <div className="chat-bubble md" dangerouslySetInnerHTML={{ __html: html }} />
      {live && !editing && (
        <div className="plan-actions">
          <button className="btn small primary" onClick={approve}>Valider le plan</button>
          <button className="btn small" onClick={() => { sfx('click'); setEditing(true); }}>Demander des changements</button>
        </div>
      )}
      {live && editing && (
        <div className="plan-edit">
          <textarea
            autoFocus
            rows={3}
            value={note}
            placeholder="Ce qu’il faut changer dans le plan…"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); changes(); }
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <div className="plan-actions">
            <button className="btn small primary" disabled={!note.trim()} onClick={changes}>Envoyer à Max</button>
            <button className="btn small ghost" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatSection() {
  const chat = useOffice((s) => s.chat);
  const typing = useOffice((s) => s.chef.typing);
  const busy = useOffice((s) => s.busySince !== null);
  const act = useOffice((s) => s.chef.act?.label);
  const tech = useOffice(techOf);
  const items = useMemo(() => group(chat, tech), [chat, tech]);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // on suit le bas de la conversation, sauf si tu es remonté la relire
  // (une seule fois par image : lire scrollHeight force une mise en page, trop cher à chaque message)
  useEffect(() => {
    const b = box.current;
    if (!b || !stick.current) return;
    const id = requestAnimationFrame(() => { b.scrollTop = b.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [chat.length, typing]);

  return (
    <section className="card chat-card">
      <div className="chat" ref={box} onScroll={(e) => {
        const b = e.currentTarget;
        stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
      }}>
        {chat.length === 0 && <p className="small muted">La conversation avec Max s’affichera ici.</p>}
        {items.map((it) => (Array.isArray(it) ? <ToolGroup key={`t${it[0].id}`} msgs={it} /> : <Message key={it.id} m={it} tech={tech} />))}
        {busy && (
          <div className="chat-msg chef live">
            <div className="chat-who">Max <span>en direct</span></div>
            <div className="chat-bubble">{typing ? tidy(typing) : <span className="muted">{act ? tidy(act) : 'Il réfléchit…'}</span>}</div>
          </div>
        )}
      </div>
    </section>
  );
}
