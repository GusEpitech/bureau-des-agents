// Les icônes de l'interface, en pixel art (8 × 8) : elles remplacent les emojis, qui changent d'aspect d'un système à
// l'autre. Chaque icône est dessinée ici, avec un contour d'un pixel qui la détache d'un fond clair comme d'un fond sombre.
import { fromRows, outline, P } from './pixels.ts';

const pal: Record<string, string> = {
  w: '#ffffff', g: '#cfd2e0', d: '#8a90a8', D: '#5d6178', o: '#ff8a3d', O: '#ffb27a', b: '#4fb3ff', B: '#9fe0ff', n: '#3ddc97',
  y: '#ffd166', p: '#ff6fa8', P: '#ffa8cf', v: '#a98bff', k: '#2b2836', r: '#ff5e52', c: '#b9763f', C: '#8a5530',
};

const book = ['.bbbbbb.', 'bBbbbbbb', 'bBwwwwbb', 'bBbbbbbb', 'bBwwwbbb', 'bBbbbbbb', '.bbbbbb.', '.dddddd.'];

const ROWS: Record<string, string[]> = {
  tools: ['.DDDDD..', 'DgggggD.', 'DgggggDc', '.DDDDDc.', '.....c..', '....c...', '...c....', '..c.....'],
  search: ['..ggg...', '.gBBBg..', 'gBwBBBg.', 'gBBBBBg.', '.gBBBg..', '..gggDD.', '......DD', '.......D'],
  web: ['..bbbb..', '.bnnbbb.', 'bnnnbbnb', 'bbnbbnnb', 'bbbbnnbb', '.bbnnbb.', '..bbbb..', '........'],
  terminal: ['.gggggg.', '.gkkkkg.', '.gkokkg.', '.gkkokg.', '.gkkkkg.', 'gggggggg', '.dddddd.', '........'],
  warn: ['...yy...', '..yyyy..', '..ykky..', '.yyykyy.', '.yyykyy.', 'yyyyyyyy', 'yyyykyyy', 'yyyyyyyy'],
  branch: ['.nn..nn.', '.nn..nn.', '.n....n.', '.nn..nn.', '..nnnn..', '...nn...', '...nn...', '...nn...'],
  clip: ['..dDDd..', '.wwDDww.', '.wkkkkw.', '.wwwwww.', '.wkkkkw.', '.wwwwww.', '.wkkkw..', '.wwwww..'],
  doc: ['.wwwwg..', '.wkkkwg.', '.wwwwww.', '.wkkkkw.', '.wwwwww.', '.wkkkkw.', '.wwwwww.', '.wwwwww.'],
  book,
  bookr: book.map((r) => r.replace(/b/g, 'r').replace(/B/g, 'O')),
  mic: ['..gggg..', '..gwwg..', '..gwwg..', '..gggg..', 'd.gggg.d', '.dddddd.', '...dd...', '..dddd..'],
  folder: ['........', '.yyy....', '.yyyyyy.', 'yyyyyyyy', 'yOOOOOOy', 'yOOOOOOy', 'yOOOOOOy', 'yyyyyyyy'],
  pen: ['......oo', '.....oOo', '....oOo.', '...oOo..', '..oOo...', '.wOo....', 'wwk.....', 'kk......'],
  bot: ['...oo...', '.gggggg.', 'gkoggokg', 'gggggggg', 'gkkkkkkg', '.gggggg.', '.d....d.', '.dd..dd.'],
  gear: ['...gg...', '.g.gg.g.', '..gggg..', 'ggg..ggg', 'ggg..ggg', '..gggg..', '.g.gg.g.', '...gg...'],
  film: ['kwkwkwkw', 'wkwkwkwk', 'kkkkkkkk', 'kwwwwwwk', 'kwkkkkwk', 'kwwwwwwk', 'kwkkkwwk', 'kkkkkkkk'],
  brain: ['..pppp..', '.pPpPpp.', 'pPppPppp', 'pppPpPpp', 'pPpppPpp', '.pPpPpp.', '..pppp..', '...pp...'],
  grad: ['...vv...', '.vvvvvv.', 'vvvwwvvv', '.vvvvvv.', '..vvvv.y', '..vv...y', '.......y', '......yy'],
  plug: ['..d..d..', '..d..d..', '.gggggg.', '.gggggg.', '..gggg..', '...gg...', '...DD...', '...DD...'],
  sun: ['y..yy..y', '.y.yy.y.', '..yyyy..', 'yyyyyyyy', 'yyyyyyyy', '..yyyy..', '.y.yy.y.', 'y..yy..y'],
  sunset: ['...yy...', '..yyyy..', '.yyyyyy.', 'yyyyyyyy', 'oooooooo', 'OoOoOoOo', '.pppppp.', '..pppp..'],
  moon: ['..yyy...', '.yyy....', 'yyy.....', 'yyy.....', 'yyy.....', '.yyy....', '..yyyyy.', '...yyy..'],
  hourglass: ['wwwwwwww', '.wyyyyw.', '..wyyw..', '...ww...', '...ww...', '..wyyw..', '.wyyyyw.', 'wwwwwwww'],
  phone: ['.gggggg.', '.gBBBBg.', '.gBBBBg.', '.gBBBBg.', '.gBBBBg.', '.gBBBBg.', '.gggggg.', '.ggddgg.'],
  hand: ['..y.y.y.', '..yyyyy.', '.yyyyyyy', '.yyyyyyy', '..yyyyy.', '...yyy..', '..yyyyy.', '.yyyyyyy'],
  bolt: ['....yy..', '...yy...', '..yy....', '.yyyyyy.', '...yy...', '..yy....', '.yy.....', 'y.......'],
  chart: ['........', '......nn', '..y...nn', '..yy..nn', 'b.yy.rnn', 'bbyyrrnn', 'bbyyrrnn', 'dddddddd'],
  star: ['...yy...', '...yy...', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '.yyyyyy.', '.yy..yy.', 'y......y'],
  palette: ['..cccc..', '.ccccCc.', 'cprccccc', 'cccyccCc', 'cnccccc.', '.ccbcvc.', '..cccc..', '........'],
  sparkle: ['...y....', '...y..y.', '.yyyyyyy', '...y..y.', '...y....', '......y.', '.....yyy', '......y.'],
  tag: ['..yyyyy.', '.yyyyyyy', 'yyykyyyy', 'yyyyyyyy', '.yyyyyyy', '..yyyyy.', '........', '........'],
  chat: ['.wwwwww.', 'wwwwwwww', 'wkwkwkww', 'wwwwwwww', '.wwwwww.', '..ww....', '..w.....', '........'],
  home: ['...rr...', '..rrrr..', '.rrrrrr.', 'rrrrrrrr', '.wwwwww.', '.wwkkww.', '.wwkkww.', '.wwwwww.'],
  egg: ['..wwww..', '.wwwwww.', 'wwwwgwww', 'wwwwwwww', 'wwwwwwgw', '.wwwwww.', '..gggg..', '........'],
  disco: ['...dd...', '..gggg..', '.gwgwgg.', '.gwgggw.', '.ggwgwg.', '.gwggwg.', '..gggg..', '........'],
  lock: ['..dddd..', '.d....d.', '.d....d.', 'yyyyyyyy', 'yyyyyyyy', 'yyykkyyy', 'yyykkyyy', 'yyyyyyyy'],
  clock: ['..gggg..', '.gwwwwg.', 'gwwkwwwg', 'gwwkwwwg', 'gwwkkwwg', 'gwwwwwwg', '.gwwwwg.', '..gggg..'],
  sliders: ['.d..d..d', '.d..d..d', 'oOO.d..d', '.d.BBB.d', '.d..d.pp', '.d..d.pp', '.d..d..d', '.d..d..d'],
  building: ['.gggggg.', '.gbgbgb.', '.gggggg.', '.gbgbgb.', '.gggggg.', '.gbgbgb.', '.gggkgg.', '.gggkgg.'],
  note: ['....gg..', '....gggg', '....g.gg', '....g...', '....g...', '.gg.g...', 'gggg....', '.gg.....'],
  team: ['.bb..pp.', 'bbbb.ppp', '.bb..pp.', 'bbbbpppp', 'bbbbpppp', 'bbbbpppp', 'bbbbpppp', '........'],
  speaker: ['...g....', '..gg..d.', 'ggggg.d.', 'ggggg.d.', 'ggggg.d.', '..gg..d.', '...g....', '........'],
  mute: ['...g....', '..gg.r.r', 'ggggg.r.', 'ggggg.r.', 'ggggg.r.', '..gg.r.r', '...g....', '........'],
  image: ['cccccccc', 'cBBBBBBc', 'cBwBBBBc', 'cBBBBnBc', 'cBBnnnnc', 'cnnnnnnc', 'cccccccc', '........'],
  news: ['wwwwwwww', 'wkkkwddw', 'wkkkwwww', 'wwwwwddw', 'wddddwww', 'wwwwwddw', 'wddddwww', 'wwwwwwww'],
  compass: ['..gggg..', '.gwwrwg.', 'gwwrrwwg', 'gwrrrrwg', 'gwbbbbwg', 'gwwbbwwg', '.gwwbwg.', '..gggg..'],
  flask: ['..gggg..', '...gg...', '...gg...', '..gwwg..', '.gnnnng.', 'gnnnnnng', 'gnnnnnng', '.gggggg.'],
};

export type UiIconName = keyof typeof ROWS;

/** Quel emoji devient quelle icône (sans le sélecteur d'emoji U+FE0F). */
const EMOJI: Record<string, UiIconName> = {
  '🛠': 'tools', '🔎': 'search', '🌐': 'web', '💻': 'terminal', '⚠': 'warn', '🌿': 'branch', '🔀': 'branch', '📋': 'clip',
  '📄': 'doc', '📕': 'bookr', '📘': 'book', '📖': 'book', '🎤': 'mic', '🎙': 'mic', '📁': 'folder', '🗂': 'folder',
  '✍': 'pen', '✏': 'pen', '📝': 'pen', '🤖': 'bot', '⚙': 'gear', '🎥': 'film', '🎬': 'film', '🧠': 'brain', '🎓': 'grad',
  '🔌': 'plug', '☀': 'sun', '🌇': 'sunset', '🌙': 'moon', '⏳': 'hourglass', '📱': 'phone', '🙋': 'hand', '⚡': 'bolt',
  '📊': 'chart', '⭐': 'star', '🎨': 'palette', '✨': 'sparkle', '🏷': 'tag', '💬': 'chat', '🏠': 'home', '🥚': 'egg',
  '🪩': 'disco', '🔒': 'lock', '🕒': 'clock', '🎛': 'sliders', '🏢': 'building', '🎶': 'note', '🎵': 'note', '👥': 'team',
  '🔊': 'speaker', '🔇': 'mute', '🖼': 'image', '📰': 'news', '🧭': 'compass', '🧪': 'flask',
};

/** Le nom de l'icône d'un emoji, ou null si on n'en a pas dessiné. */
export function iconOfEmoji(e: string): UiIconName | null {
  return EMOJI[e.replace(/️/g, '')] ?? null;
}

/** Une expression qui trouve tous les emojis qu'on sait dessiner. */
export const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI).map((e) => e).join('|')})️?`, 'gu');

const urls = new Map<string, string>();
/** L'image (data URL) de l'icône, avec son contour : on la montre agrandie d'un facteur entier, sans lissage. */
export function uiIconUrl(name: UiIconName): string {
  let u = urls.get(name);
  if (!u) {
    const src = fromRows(ROWS[name], pal);
    const m = document.createElement('canvas');
    m.width = src.width + 2;
    m.height = src.height + 2;
    m.getContext('2d')!.drawImage(src, 1, 1);
    outline(m, P.ink, { diagonal: false });
    u = m.toDataURL();
    urls.set(name, u);
  }
  return u;
}
