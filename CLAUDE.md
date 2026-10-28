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

- **`server/`** : `index.ts` (HTTP, WebSocket, sécurité), `bureau.ts` (les missions : démarrage, séance Claude Code, fichiers, reprise),
  `claude.ts` (lance `claude -p` en stream-json et traduit sa sortie en événements du bureau), `team.ts` (les métiers et les consignes).
  Les morceaux de `bureau.ts` qui se suffisent à eux-mêmes vivent à côté : `settings.ts` (valeurs par défaut et nettoyage des réglages),
  `rules.ts` (le règlement), `branches.ts` (les branches git), `versions.ts` (les copies de rendus), `records.ts` (lire un enregistrement,
  l'historique de l'équipe), `types.ts` (`State`, `Live`, `Current`), `util.ts`, `db.ts` (la base SQLite, ouverte une fois), `store.ts` (l'état : missions, réglages, quota, mission ouverte), `library.ts` (l'index de l'historique), `git.ts`, `mcp.ts`.
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
- **Le mode Git** (onglet « Git » du panneau, dès qu'un dossier de travail est choisi, avec ou sans mission) : le dépôt du dossier comme dans un IDE. `server/repo.ts` répond aux demandes `repo` (`RepoReq` : `overview`, `branches`, `log`, `show`, `changes`, `diff`, `fetch`, `pull`, `push`, `checkout`, `new_branch`, `delete_branch`, `merge`, `stage`, `unstage`, `discard`, `commit`, `stash`…) sur `settings.workdir` : jamais un chemin du navigateur. Git est lancé sans shell, un seul à la fois par dépôt, et tout ce qui vient du navigateur (branches, empreintes, chemins) est vérifié avant d'arriver à git ; pas de push forcé. `Bureau.repo()` refuse de changer de branche, de tirer, de fusionner ou d'annuler pendant que l'équipe écrit. Côté navigateur, `src/ui/Git.tsx` : changements (prêts à commiter / modifiés, diff, commit, stash), historique avec graphe (`layoutGraph`), branches ; la 4e vue, « Mission », est l'ancien diff de la mission (`DiffSection`). `store.repo` garde ce que git a répondu.
- **La conversation** : le store garde toute la conversation (`chat`, affichée par `src/ui/Chat.tsx`, onglet du panneau). Une
  mission passée se rouvre (`resume` → `current`) depuis l'enregistrement, et la mission ouverte est rouverte au redémarrage
  (`currentId` dans l'état) : Max reprend sa séance Claude Code (`--resume`) au message suivant, avec tout son historique.
- **La base SQLite** (`.bureau/bureau.db`, `node:sqlite`) : `store.ts` y garde l'état du bureau (tables `missions` et `kv` : réglages, quota, mission ouverte) ; un ancien `state.json` est migré une fois, puis renommé `state.json.migrated` (jamais supprimé). Sans `node:sqlite`, retour au fichier `state.json`. `library.ts` y range aussi un index (FTS5 pour la recherche de « Mes missions », tables `agents` et `turns` pour « Le bilan » : tokens par passage d'agent avec le détail entrée/sortie/cache/réflexion que `Normalizer` additionne message par message, `leave.use`). Les `.jsonl` restent la source de vérité de ce qui s'est passé : l'index se reconstruit tout seul (monte `SCHEMA` dans `library.ts` si ses tables changent), mais l'état, lui, n'est que dans la base : ne la supprime pas.
- **`shared/protocol.ts`** : tous les messages entre le serveur et le navigateur, et les événements (`OfficeEvent`) : `start`, `hire`,
  `act`, `report`, `leave`, `file`, `ask`, `end`… **`shared/activity.ts`** : les métiers, leurs outils, les textes affichés.
- **`src/state/store.ts`** (zustand) range chaque événement, puis le transmet au moteur (`src/state/bus.ts` → `src/engine/world.ts`).
- **`src/engine/`** : le monde (`world.ts` : les événements, le chat, le mode soirée ; `actor.ts` : un robot et ses gestes ; `nav.ts` : se déplacer
  sans se coincer, A* dans `path.ts` ; `animate.ts` : pose et regard), le dessin (`render.ts`, `room.ts`,
  `furniture.ts`, `robots.ts` : tout le pixel art est dessiné en code, sur une image de 352 × 368), la lumière (`render.ts` : la carte de lumière multipliée sur l'image ; `ambience.ts` : rayons des fenêtres, flaques sous les lampes et les écrans, poussière, traînée du néon, vignettage), la météo (`weather.ts` : pluie des fenêtres et de la cour, `__bureau.weather.force = 'rain' | 'clear' | 'auto'`) la vie de la cour (`yardlife.ts` : feuilles, lucioles, papillons), ce qu'on voit dehors (`outside.ts` : ciel des fenêtres, voiture dans la rue ; `deskstuff.ts` : l'objet de chaque bureau) et le fondu entre deux heures (`Renderer.draw`), la caméra et son réalisateur
  (`camera.ts`), les clics (`hits.ts`).
- **`src/ui/`** : l'interface React. `Office.tsx` (le canevas, les bulles, la boucle d'animation), `Dialog.tsx` (Max et la boîte de
  saisie), `Rooms.tsx` (les fenêtres qu'on ouvre en cliquant), `interact.ts` (ce que fait chaque clic).
- **Petites mises en scène** : un test qui échoue (commande `bash` qui ressemble à un test, ou n'importe quelle commande du métier « analyse ») fait lever le poing au robot (`Actor.angryUntil`, pose `fist`, yeux `angry`, `World.rage`). Le tableau du fond montre la semaine (`World.week`, message `week`) tant qu'il n'y a pas de plan. Le chat (`cat.ts`) vient voir ceux qui dorment (`sleepers`) et s'endort sur le clavier de Max quand son bureau est libre (`deskTaken`).
- **`src/audio/`** : bruitages ZzFX, jukebox (`public/music/`), voix de Max (`public/voice/`).
- **`public/demo/mission.json`** : une vraie mission enregistrée, rejouée quand le serveur n'est pas là (`scripts/make-demo.ts`).

## Tester sans dépenser l'abonnement

Le menu de debug (touche F3, `src/ui/Debug.tsx`) donne les mesures du dessin (`perf` dans `src/engine/debug.ts`, rempli par la boucle d'`Office.tsx`) et des interrupteurs (`debug` : météo, heure, vitesse, cadence, couches coupées). Pour mesurer ce que coûte un ajout de dessin, coupe sa couche et compare.

Une mission enregistrée se rejoue à l'identique (`H`, puis « Rejouer »), et sans serveur le bureau passe en démo. Dans la console du
navigateur, `window.__bureau` donne accès au store, au monde, à la caméra et à `playReplay(mission, log, vitesse)`.
Pour filmer le bureau image par image (un script de capture qui pilote l'horloge), `window.__CAPTURE` fait dessiner chaque image et
fournit le rythme de la musique (voir la boucle de `Office.tsx`).

## Les règles

- **Français, tutoiement, phrases courtes** dans tout ce que l'utilisateur lit. Le bureau est fait pour des débutants.
- **Jamais de chemin complet ni de nom d'utilisateur à l'écran** : `tidy()` (`src/ui/tidy.ts`) et `tilde()` (`src/ui/format.ts`).
- **Léger** : la boucle dessine au plus 24 images par seconde en mission, 8 au repos, rien quand l'onglet est caché ; environ une
  milliseconde par image. Pas de 3D, pas de bibliothèque lourde.
- **Chargement** : le serveur compresse le texte (brotli ou gzip, gardé en mémoire) et garde `assets/` un an (noms à empreinte) ; `vite.config.ts` précharge les polices du premier affichage ; `projectModeOf` se souvient du dernier mode (`bureau:lastProject`) tant que le serveur n'a pas répondu, pour que la mise en page ne saute pas (CLS). Ne rends rien dans le panneau qui dépende de `hello` (dossier, projet) avant qu'il soit arrivé.
- **Tokens** : le contexte de Max est mesuré à chaque tour (événement `ctx`, jauge dans la conversation) et chaque agent rend ses tokens à son départ (`leave.tokens`). Les réglages « Économiser des tokens » (`skills`, `mcpOff` par projet, `chefEffort`, `roleEffort`) se traduisent en options de `claude` (`--disable-slash-commands`, `--disallowedTools mcp__…`, `--effort`, champ `effort` des agents) dans `server/claude.ts`.
- **Sécurité** : le serveur n'écoute que sur 127.0.0.1 et vérifie l'origine des WebSocket ; l'équipe tourne en `--restricted`, avec
  seulement les outils de son métier, sauf en mode projet, où elle suit ta config Claude Code (réglages, hooks, MCP, skills,
  agents ; ni `--restricted` ni `--tools`) ; les sites créés s'affichent sous `/apercu/` dans un bac à sable (CSP `sandbox`).
- **zustand** : un sélecteur qui renvoie un nouveau tableau ou objet passe par `useShallow`, sinon React boucle.
- **Pas d'image externe** dans le bureau : un nouveau meuble se dessine en code dans `furniture.ts`, avec sa place dans `layout.ts`
  et, s'il est cliquable, une entrée dans `hits.ts` et `interact.ts`.
- **Musique et voix** : seulement des fichiers qu'on a le droit de partager, avec leur origine dans le README.
