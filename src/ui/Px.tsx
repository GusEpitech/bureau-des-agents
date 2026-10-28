// Une icône en pixel art à la place d'un emoji. `<Px e="🛠️" />` (l'emoji d'origine) ou `<Px n="tools" />` (le nom).
// `ico('🛠️ Projet')` rend un texte en remplaçant ses emojis par leurs icônes.
import { Fragment, type ReactNode } from 'react';
import { EMOJI_RE, iconOfEmoji, uiIconUrl, type UiIconName } from '../engine/uiicons.ts';

export function Px({ e, n }: { e?: string; n?: UiIconName }) {
  const name = n ?? (e ? iconOfEmoji(e) : null);
  if (!name) return <>{e ?? ''}</>;
  return <img className="px" src={uiIconUrl(name)} alt="" aria-hidden="true" draggable={false} />;
}

/** Un texte dont les emojis sont remplacés par des icônes pixel. */
export function ico(text: string | null | undefined): ReactNode {
  if (!text) return text ?? null;
  const parts = text.split(EMOJI_RE);
  if (parts.length === 1) return text;
  // split avec groupe capturant : les indices impairs sont les emojis
  return parts.map((p, i) => (i % 2 ? <Px key={i} e={p} /> : p ? <Fragment key={i}>{p}</Fragment> : null));
}
