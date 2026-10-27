// La conversation avec Max, du début à la fin : tes demandes, ses réponses, qui il appelle, et ses récaps.
// Elle reste là après la mission (et après un redémarrage du bureau) : on la relit, et on la continue.
import { memo, useEffect, useMemo, useRef } from 'react';
import { useOffice, type ChatMsg } from '../state/store.ts';
import { copyText, mdToHtml } from './md.ts';
import { tidy } from './tidy.ts';

const time = (at: number) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const Message = memo(function Message({ m }: { m: ChatMsg }) {
  const html = useMemo(() => (m.kind === 'chef' || m.kind === 'final' ? mdToHtml(tidy(m.text)) : ''), [m.kind, m.text]);
  if (m.kind === 'note') return <div className="chat-note">{tidy(m.text)}</div>;
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
    </div>
  );
});

export function ChatSection() {
  const chat = useOffice((s) => s.chat);
  const typing = useOffice((s) => s.chef.typing);
  const busy = useOffice((s) => s.busySince !== null);
  const act = useOffice((s) => s.chef.act?.label);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // on suit le bas de la conversation, sauf si tu es remonté la relire
  useEffect(() => {
    const b = box.current;
    if (b && stick.current) b.scrollTop = b.scrollHeight;
  }, [chat.length, typing]);

  return (
    <section className="card chat-card">
      <div className="chat" ref={box} onScroll={(e) => {
        const b = e.currentTarget;
        stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
      }}>
        {chat.length === 0 && <p className="small muted">La conversation avec Max s’affichera ici.</p>}
        {chat.map((m) => <Message key={m.id} m={m} />)}
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
