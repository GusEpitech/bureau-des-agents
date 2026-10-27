// Le markdown des rapports, affiché sans risque : pas de HTML brut, des liens web seulement (ouverts
// dans un nouvel onglet), pas d'images distantes.
import { Marked } from 'marked';

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ── La coloration du code : un petit surligneur maison (pas de bibliothèque lourde) ──
// Une seule expression par langage : commentaires, chaînes, nombres, mots-clés. Tout est échappé :
// le résultat ne contient jamais de HTML venu du texte, seulement nos <span class="hl-…">.
const STR = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;
const TPL = '`(?:\\\\.|[^`\\\\])*`';
const TRIPLE = String.raw`"""[\s\S]*?"""` + '|' + String.raw`'''[\s\S]*?'''`;
const NUM = String.raw`\b\d+(?:\.\d+)?\b`;
const words = (w: string) => String.raw`\b(?:${w.trim().split(/\s+/).join('|')})\b`;
const LANGS: Record<string, RegExp> = {};
function lang(names: string, parts: { c?: string; s?: string; n?: string; k?: string }, flags = 'g') {
  const alt = (['c', 's', 'n', 'k'] as const).filter((g) => parts[g]).map((g) => `(?<${g}>${parts[g]})`).join('|');
  for (const n of names.split(' ')) LANGS[n] = new RegExp(alt, flags);
}
lang('js jsx ts tsx javascript typescript mjs cjs', {
  c: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`, s: `${STR}|${TPL}`, n: NUM,
  k: words(`const let var function return if else for while do switch case break continue new class extends import from export default
    async await try catch finally throw typeof instanceof in of interface type enum implements public private protected readonly
    null undefined true false this void as yield static get set`),
});
lang('py python', {
  c: String.raw`#[^\n]*`, s: `${TRIPLE}|${STR}`, n: NUM,
  k: words(`def class return if elif else for while in not and or is import from as with try except finally raise None True False
    lambda yield pass break continue async await self global nonlocal`),
});
lang('sh bash shell zsh console', {
  c: String.raw`(?<![\w$])#[^\n]*`, s: STR, n: String.raw`\$\{?[\w@#?*!-]+\}?`,
  k: words('if then else elif fi for do done while until case esac function export local return in echo cd sudo source set unset'),
});
lang('json jsonc', { c: String.raw`\/\/[^\n]*`, s: STR, n: String.raw`-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`, k: words('true false null') });
lang('sql psql pgsql', {
  c: String.raw`--[^\n]*`, s: "'(?:''|[^'])*'", n: NUM,
  k: words(`select from where insert into values update set delete create table alter add drop index unique primary key foreign
    references not null and or join left right inner outer on group by order having limit offset as distinct check default
    constraint begin commit rollback if exists returning cascade view function trigger policy enable row level security using`),
}, 'gi');

/** Le code, échappé et coloré (rien qu'échappé pour un langage inconnu ou un très gros bloc). */
export function highlight(code: string, name: string): string {
  const re = LANGS[name];
  if (!re || code.length > 30000) return escapeHtml(code);
  re.lastIndex = 0;
  let out = '';
  let at = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (!m[0]) { re.lastIndex++; continue; }
    const g = m.groups ?? {};
    const cls = g.c ? 'c' : g.s ? 's' : g.n ? 'n' : 'k';
    out += escapeHtml(code.slice(at, m.index)) + `<span class="hl-${cls}">${escapeHtml(m[0])}</span>`;
    at = m.index + m[0].length;
  }
  return out + escapeHtml(code.slice(at));
}

const marked = new Marked({ breaks: true, gfm: true });
marked.use({
  renderer: {
    html: ({ text }) => escapeHtml(text ?? ''),
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!SAFE_URL.test(href ?? '')) return text;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image({ text }) { return escapeHtml(text ?? ''); },
    // un bloc de code : le langage, un bouton « Copier » (voir installCopy), la coloration
    code({ text, lang: info }) {
      const name = (info ?? '').trim().split(/\s+/)[0].toLowerCase().replace(/[^\w+#-]/g, '').slice(0, 20);
      return `<div class="code-block"><div class="code-head"><span>${escapeHtml(name || 'texte')}</span>`
        + '<button type="button" class="code-copy" data-copy="code">Copier</button></div>'
        + `<pre><code${name ? ` class="lang-${escapeHtml(name)}"` : ''}>${highlight(text ?? '', name)}</code></pre></div>`;
    },
  },
});

export function mdToHtml(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

/** Copie un texte, et le bouton dit « Copié » un instant. */
export function copyText(text: string, btn?: HTMLElement | null) {
  const done = () => {
    if (!btn) return;
    const old = btn.dataset.label ?? btn.textContent ?? '';
    btn.dataset.label = old;
    btn.textContent = 'Copié ✓';
    setTimeout(() => { btn.textContent = old; }, 1400);
  };
  void navigator.clipboard?.writeText(text).then(done, () => {});
}

let copyInstalled = false;
/** Les boutons « Copier » des blocs de code (le HTML du markdown ne peut pas porter d'écouteur : on écoute la page). */
export function installCopy() {
  if (copyInstalled || typeof document === 'undefined') return;
  copyInstalled = true;
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-copy="code"]');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code');
    if (code) copyText(code.textContent ?? '', btn);
  });
}
