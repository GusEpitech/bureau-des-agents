# Les versions

## Prochaine version

Le bureau devient aussi un outil pour développer sur tes propres dépôts.

**Mode projet**
- Choisis un dossier de travail : la mission tourne dedans, sur sa propre branche git (le bureau refuse si le dépôt a des changements pas commités).
- Le nom de la branche suit le modèle des réglages (par exemple `feature/{ticket}-{titre}`). Max la nomme après avoir lu le ticket, tu peux la modifier avant de valider, et renommer la branche toi-même ne bloque rien.
- Le plan est toujours validé avant que l'équipe code. Tes remarques partent à Max si tu refuses.
- L'équipe de développement (exploration, code, interface, tests, docs) suit ta configuration Claude Code (réglages, hooks, MCP, skills).
- La conversation, l'onglet Diff, les actions git (commiter, pousser) et la liste des connecteurs MCP.
- Le mode rapide, pour les petites tâches : Max fait tout seul, sans sous-agents ni plan.

**Économiser des tokens**
- Les skills sont coupés par défaut dans les missions, les connecteurs MCP se choisissent projet par projet, et l'effort se règle par métier.
- Une jauge montre la taille du contexte de Max, et la fenêtre de l'équipe montre la part de chaque métier.

**L'historique**
- Une base SQLite (`.bureau/bureau.db`) garde maintenant l'état du bureau (missions, réglages, quota). Ton ancien `state.json` est migré une fois, puis renommé `state.json.migrated`.
- La recherche dans « Mes missions » trouve un mot dans tes demandes, les réponses de Max, les rapports, les plans et les fichiers.
- « Le bilan » (fenêtre de l'équipe) montre la consommation par métier, par projet et par semaine, et les missions les plus gourmandes. Chaque agent rend le détail de ce qu'il a lu, écrit et réfléchi.
- L'historique de l'équipe est refait : une carte repliable par mission, un filtre par métier, le coût et le rapport de chaque passage.

**Le bureau**
- Les robots vont mieux de leur chemin, restent au bureau après leur tâche et s'écartent les uns des autres.
- Du temps libre : prendre des notes, regarder son téléphone, dormir, s'asseoir sur le canapé sans déranger le chat. Une cigarette visible, une vraie bouffée.
- Un test qui échoue met le testeur en colère : poing levé et vapeur.
- Le tableau du fond affiche la semaine (missions et tokens) quand il n'y a pas de plan.
- Le chat vient voir ceux qui dorment, et s'endort sur le clavier de Max quand il est absent.
- Les bulles passent devant le nom des robots qui sont derrière.

**L'interface**
- Une barre du haut avec des boutons nommés, un sélecteur de projet et de mode, des réglages rangés par sujet, une fenêtre de l'équipe plus claire.

**Sous le capot**
- `bureau.ts` et `world.ts` sont découpés en modules plus petits (réglages, branches, versions, enregistrements ; robot, déplacements, animation).

## v0.1.0 (14 octobre 2026)

La première version publique.

- Max, le chef de projet, et son équipe de vrais sous-agents Claude Code : recherche, code, design, rédaction, analyse.
- Le bureau en pixel art, dessiné en code : les robots vont à leur poste, et chaque bulle montre ce qu'ils font vraiment.
- Les rapports, les fichiers rendus, les sites créés affichés dans un écran (ordinateur ou téléphone), le code et ses versions.
- Le plan au tableau et son historique, toute l'équipe et ses outils, l'historique des agents passés au bureau.
- Rejouer une mission sans relancer l'équipe, une démo hors ligne.
- Le mode tournage (caméra automatique, cadre vertical), la visite guidée avec la voix de Max, le jukebox, et quelques surprises.
