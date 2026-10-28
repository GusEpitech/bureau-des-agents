# Le Bureau des agents : notes pour Claude Code

Tu travailles sur un logiciel open source : un bureau en pixel art où l'on regarde de vrais sous-agents Claude Code travailler.
Lis ce fichier avant de modifier le code. Pour installer et lancer le bureau, suis la section « Pour Claude Code » du README.

## Les commandes

- `npm start` : vérifie Node, construit le client, lance le serveur sur http://localhost:4848 et ouvre le navigateur.
- `npm run dev` : serveur + Vite avec rechargement à chaud sur http://localhost:5174.
- `npm run check` : les types (client et serveur). `npm run build` : la construction. Les deux doivent passer avant une pull request.
- Variables utiles : `PORT` (le port du serveur), `BUREAU_DIR` (le dossier du bureau, par défaut `~/Documents/Bureau des agents`).

Node 22.18 ou plus récent exécute directement le TypeScript du serveur (suppression des types) : dans `server/` et `shared/`, les imports
gardent l'extension `.ts`, et rien qui demande une vraie compilation (pas d'`enum`, pas de `namespace`, pas de paramètres-propriétés).

## Comment c'est fait

- **`server/`** : `index.ts` (HTTP, WebSocket, sécurité), `bureau.ts` (les missions, les fichiers, les versions, l'historique),
  `claude.ts` (lance `claude -p` en stream-json et traduit sa sortie en événements du bureau), `team.ts` (les métiers et les consignes).
- **Mode projet** : quand un dossier de travail est choisi (`settings.workdir`, sous la zone de saisie), la mission tourne dans ce
  dossier au lieu d'un dossier neuf de `Missions/`. Le serveur crée une branche git `bureau/…` (et refuse si le dépôt a des
  changements pas commités), Max et l'équipe reçoivent des consignes de développement (`projectPrompt`, `PROJECT_TEAM` dans
  `team.ts`, sur les mêmes postes du bureau), et les copies de versions sont coupées (git s'en charge).
  Le plan est toujours validé : la séance démarre en `--permission-mode plan`, et chaque nouvelle demande la remet en plan
  (control_request `set_permission_mode`). Max soumet son plan avec ExitPlanMode, qui arrive comme une demande de permission :
  validé, le bureau autorise puis remet le mode de travail réglé (auto ou acceptEdits) ; refusé, tes remarques partent dans le
  refus (`answer.message`). Le plan s'affiche dans la conversation (`ChatMsg` kind `plan`), pas dans l'AskBar.
  Côté navigateur, `projectModeOf` (store) pilote l'affichage : `roleInfo()` et `roleSign()` (`shared/activity.ts`) donnent les
  noms des métiers et des écriteaux selon le mode (à utiliser plutôt que `ROLES[r].label`), et `.app.project` passe l'accent
  au turquoise (`--accent-rgb` remplace les `rgba(255, 138, 61, …)`).
- **La conversation** : le store garde toute la conversation (`chat`, affichée par `src/ui/Chat.tsx`, onglet du panneau). Une
  mission passée se rouvre (`resume` → `current`) depuis l'enregistrement, et la mission ouverte est rouverte au redémarrage
  (`currentId` dans l'état) : Max reprend sa séance Claude Code (`--resume`) au message suivant, avec tout son historique.
- **`shared/protocol.ts`** : tous les messages entre le serveur et le navigateur, et les événements (`OfficeEvent`) : `start`, `hire`,
  `act`, `report`, `leave`, `file`, `ask`, `end`… **`shared/activity.ts`** : les métiers, leurs outils, les textes affichés.
- **`src/state/store.ts`** (zustand) range chaque événement, puis le transmet au moteur (`src/state/bus.ts` → `src/engine/world.ts`).
- **`src/engine/`** : le monde (`world.ts` : robots, déplacements A*, chat, mode soirée), le dessin (`render.ts`, `room.ts`,
  `furniture.ts`, `robots.ts` : tout le pixel art est dessiné en code, sur une image de 352 × 368), la caméra et son réalisateur
  (`camera.ts`), les clics (`hits.ts`).
- **`src/ui/`** : l'interface React. `Office.tsx` (le canevas, les bulles, la boucle d'animation), `Dialog.tsx` (Max et la boîte de
  saisie), `Rooms.tsx` (les fenêtres qu'on ouvre en cliquant), `interact.ts` (ce que fait chaque clic).
- **`src/audio/`** : bruitages ZzFX, jukebox (`public/music/`), voix de Max (`public/voice/`).
- **`public/demo/mission.json`** : une vraie mission enregistrée, rejouée quand le serveur n'est pas là (`scripts/make-demo.ts`).

## Tester sans dépenser l'abonnement

Une mission enregistrée se rejoue à l'identique (`H`, puis « Rejouer »), et sans serveur le bureau passe en démo. Dans la console du
navigateur, `window.__bureau` donne accès au store, au monde, à la caméra et à `playReplay(mission, log, vitesse)`.
Pour filmer le bureau image par image (un script de capture qui pilote l'horloge), `window.__CAPTURE` fait dessiner chaque image et
fournit le rythme de la musique (voir la boucle de `Office.tsx`).

## Les règles

- **Français, tutoiement, phrases courtes** dans tout ce que l'utilisateur lit. Le bureau est fait pour des débutants.
- **Jamais de chemin complet ni de nom d'utilisateur à l'écran** : `tidy()` (`src/ui/tidy.ts`) et `tilde()` (`src/ui/format.ts`).
- **Léger** : la boucle dessine au plus 24 images par seconde en mission, 8 au repos, rien quand l'onglet est caché ; environ une
  milliseconde par image. Pas de 3D, pas de bibliothèque lourde.
- **Tokens** : le contexte de Max est mesuré à chaque tour (événement `ctx`, jauge dans la conversation) et chaque agent rend ses tokens à son départ (`leave.tokens`). Les réglages « Économiser des tokens » (`skills`, `mcpOff` par projet, `chefEffort`, `roleEffort`) se traduisent en options de `claude` (`--disable-slash-commands`, `--disallowedTools mcp__…`, `--effort`, champ `effort` des agents) dans `server/claude.ts`.
- **Sécurité** : le serveur n'écoute que sur 127.0.0.1 et vérifie l'origine des WebSocket ; l'équipe tourne en `--restricted`, avec
  seulement les outils de son métier, sauf en mode projet, où elle suit ta config Claude Code (réglages, hooks, MCP, skills,
  agents ; ni `--restricted` ni `--tools`) ; les sites créés s'affichent sous `/apercu/` dans un bac à sable (CSP `sandbox`).
- **zustand** : un sélecteur qui renvoie un nouveau tableau ou objet passe par `useShallow`, sinon React boucle.
- **Pas d'image externe** dans le bureau : un nouveau meuble se dessine en code dans `furniture.ts`, avec sa place dans `layout.ts`
  et, s'il est cliquable, une entrée dans `hits.ts` et `interact.ts`.
- **Musique et voix** : seulement des fichiers qu'on a le droit de partager, avec leur origine dans le README.
