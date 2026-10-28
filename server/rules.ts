// Le règlement du bureau (« Règlement du bureau.md ») et le LISEZ-MOI : leurs textes, et la lecture du règlement.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const RULES_FILE = 'Règlement du bureau.md';

export const RULES_TEMPLATE = `# Le règlement du bureau

Max, le chef de projet, lit ce fichier avant chaque mission. Écris-y ce que l'équipe doit savoir
sur toi, avec tes mots, comme si tu briefais de nouveaux collègues.

## Qui je suis
<!-- Par exemple : « Je m'appelle Alex, je suis coach sportif à Lyon. Je vends des programmes en ligne à des femmes de 30 à 45 ans. » -->

## Comment travailler pour moi
- Réponds-moi en français, simplement.
- Va droit au but : je veux des livrables prêts à servir.
- Range tout dans le dossier de la mission, avec des noms de fichiers clairs.
`;

export const README = `# Le Bureau des agents

Ici travaille ton équipe d'agents IA (des agents Claude Code).

- « Règlement du bureau.md » : ce que l'équipe doit savoir sur toi. Max, le chef, le lit avant chaque mission.
- « Missions » : un dossier par mission. Tout ce que l'équipe produit (rapports, pages web, textes) y est rangé.

Le dossier caché « .bureau » garde l'état du bureau et l'enregistrement de chaque mission, pour la rejouer.
Tu peux le supprimer pour tout recommencer.
`;

/** Le contenu du règlement, sans les commentaires d'exemple. */
export function readRules(dir: string) {
  try {
    return readFileSync(path.join(dir, RULES_FILE), 'utf8').replace(/<!--[\s\S]*?-->/g, '').slice(0, 20000);
  } catch { return ''; }
}
