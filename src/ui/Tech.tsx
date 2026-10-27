// Le mode technique, à l'écran : les appels d'outils (entrée brute et sortie), repliés par défaut.
import { memo, useState } from 'react';
import { useOffice, type ActView, type ChatMsg } from '../state/store.ts';
import { prettyRaw, techLabel } from './tech.ts';
import { tidy } from './tidy.ts';

const mark = (ok: boolean | undefined) => (ok === undefined ? <span className="tool-mark run">…</span> : ok ? <span className="tool-mark ok">✓</span> : <span className="tool-mark ko">✕</span>);

/** L'entrée et la sortie d'un outil, en police mono, avec défilement. */
export function ToolIO({ tool, raw, out }: { tool?: string; raw?: string; out?: string }) {
  return (
    <div className="tool-io">
      {raw && <pre className="tool-raw">{tidy(prettyRaw(tool, raw))}</pre>}
      {out !== undefined && (out.trim() ? <pre className="tool-out">{tidy(out)}</pre> : <pre className="tool-out muted">(pas de sortie)</pre>)}
    </div>
  );
}

/** Une ligne d'outil : « Ada · $ npm test ✓ » ; un clic déplie l'entrée et la sortie. */
const ToolLine = memo(function ToolLine({ m }: { m: ChatMsg }) {
  const [open, setOpen] = useState(false);
  const name = useOffice((s) => (m.act?.who === 'chef' ? 'Max' : s.agents[m.act?.who ?? '']?.name ?? 'Agent'));
  const a = m.act!;
  return (
    <div className={`tool-line ${open ? 'open' : ''}`}>
      <button onClick={() => setOpen(!open)} title="Voir l'entrée et la sortie">
        <span className="tool-who">{name}</span>
        <code>{tidy(techLabel(a.tool, a.raw, m.text))}</code>
        {mark(a.ok)}
      </button>
      {open && <ToolIO tool={a.tool} raw={a.raw} out={a.out} />}
    </div>
  );
});

/** Des appels d'outils qui se suivent : affichés tels quels s'ils sont peu nombreux, sinon repliés en « 12 actions ». */
export function ToolGroup({ msgs }: { msgs: ChatMsg[] }) {
  const [open, setOpen] = useState(false);
  if (msgs.length <= 3) return <div className="tool-group">{msgs.map((m) => <ToolLine key={m.id} m={m} />)}</div>;
  const fails = msgs.filter((m) => m.act?.ok === false).length;
  const last = msgs[msgs.length - 1];
  return (
    <div className="tool-group">
      <button className="tool-sum" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'} {msgs.length} actions{fails ? ` · ${fails} en échec` : ''}</span>
        {!open && <code>{tidy(techLabel(last.act?.tool, last.act?.raw, last.text))}</code>}
      </button>
      {open && msgs.map((m) => <ToolLine key={m.id} m={m} />)}
    </div>
  );
}

/** Les actions d'un agent, avec leur entrée et leur sortie (fiche d'un agent, en mode technique). */
export function TechActs({ acts, max = 40 }: { acts: ActView[]; max?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="tool-group">
      {acts.slice(-max).map((x) => (
        <div key={x.id} className={`tool-line ${open === x.id ? 'open' : ''}`}>
          <button onClick={() => setOpen(open === x.id ? null : x.id)}>
            <code>{tidy(techLabel(x.tool, x.raw, x.detail))}</code>
            {mark(x.ok)}
          </button>
          {open === x.id && <ToolIO tool={x.tool} raw={x.raw} out={x.out} />}
        </div>
      ))}
    </div>
  );
}

/** Le prompt envoyé à un agent, replié. */
export function PromptBox({ prompt }: { prompt: string }) {
  return (
    <details className="tech-prompt">
      <summary>Le prompt envoyé par Max ({prompt.length.toLocaleString('fr-FR')} caractères)</summary>
      <pre>{tidy(prompt)}</pre>
    </details>
  );
}
