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

**Mode Git**
- L'onglet « Diff » devient « Git » et marche comme dans un IDE, même sans mission : tes changements (prêts à commiter, modifiés, avec leur diff), le commit, la mise de côté (stash).
- L'historique des commits avec son graphe de branches, les étiquettes (branches, tags), le détail d'un commit et ses fichiers.
- Les branches : changer, créer, fusionner, supprimer, récupérer celles de `origin`.
- Fetch, pull (avance rapide, fusion ou rebase quand les deux côtés ont avancé) et push, avec l'état du remote (↑ ↓), les conflits et l'annulation d'une fusion.
- Le diff de la mission est toujours là, dans la vue « Mission ».

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
- Une vraie ambiance lumineuse, surtout la nuit : rayons de lune (ou de soleil couchant) qui traversent les fenêtres avec l'ombre des montants, poussière qui flotte dedans, flaques de lumière sur le parquet autour des lampes, lueur colorée des écrans sur les bureaux, traînée du néon, coins plus sombres.
- De la pluie derrière les fenêtres et dans la cour (gouttes sur les vitres, éclaboussures, flaques qui reflètent les lampadaires). Elle passe toute seule, deux minutes tous les quarts d'heure.
- La cour vit : feuilles qui tombent des arbres, lucioles et papillons de nuit autour des lampadaires le soir. De la vapeur monte des tasses, et les robots qui travaillent ont le reflet de leur écran sur la visière.
- Un vrai portail au fond de la cour : enseigne en bois, piliers avec leurs lanternes, battants de fer ouverts, la rue derrière.
- Dehors : les fenêtres de la ville s'allument et s'éteignent, un avion et des oiseaux passent, des étoiles filantes la nuit, la lune a sa vraie phase. Une voiture passe de temps en temps dans la rue derrière le portail, avec ses phares la nuit.
- Le changement d'heure (jour, soir, nuit) se fait en fondu au lieu de sauter.
- Chaque robot pose un petit objet sur son bureau (canard, mini-plante, post-it, photo, figurine, mug) : toujours le même pour le même prénom.
- Un babyfoot dans la cour : deux robots en pause y jouent, la balle roule, le gagnant lève les bras.
- Les robots ont du poids : un petit rebond quand ils s'assoient (écrasé d'un pixel) et se lèvent (étiré), et en mission ils tournent d'abord la tête vers où ils vont avant de partir.
- Quand tu valides le plan, Max tape dans ses mains, des étincelles vertes partent du tableau et les autres se tournent vers lui.
- Le soir et la nuit, chaque bureau occupé allume sa lampe (flaque chaude sur le plateau) et l'éteint doucement quand son agent part.
- La cour vit au repos : les robots s'assoient sur les bancs, arrosent les fleurs, surveillent le barbecue (qui fume).
- La cour s'équipe : table de pique-nique avec parasol, massifs de fleurs, barbecue. Et Loula rejoint l'exploration.
- Des textures plus détaillées : veines, nœuds et clous du parquet, passages usés, tapis avec franges et motifs, papier peint et boiseries, murs en briques, dalles fissurées et mousse dans la cour, fleurs dans l'herbe.

**L'interface**
- Les emojis sont remplacés par de vraies icônes en pixel art (une quarantaine, dessinées en code) : ils ne changent plus d'aspect d'un système à l'autre.
- Les fenêtres, les alertes, les menus, les cases à cocher, les boutons ronds et les listes prennent le style pixel : coins francs, ombre pleine, titres en police pixel, coche orange. Le focus au clavier se voit partout.
- Les noms des robots groupés au même endroit ne se chevauchent plus : ils se rangent en escalier.
- Le panneau prend le style du bureau : cartes à coins francs avec une ombre pleine, boutons qui s'enfoncent quand on appuie, titres en police pixel, une trame de points discrète, des barres de défilement carrées.
- La teinte de l'interface suit doucement l'heure et la météo du bureau (dorée le jour, rose le soir, bleutée la nuit, grise sous la pluie).
- Un réglage « Fluidité » (économe, fluide à 60 images par seconde, ou max) dans les Réglages. Elle ne compte que quand quelque chose bouge : au repos, le bureau reste à 8 images par seconde.
- Une barre du haut avec des boutons nommés, un sélecteur de projet et de mode, des réglages rangés par sujet, une fenêtre de l'équipe plus claire.

**Chargement plus rapide**
- Le serveur compresse les fichiers du bureau (le script passe de 490 Ko à 146 Ko) et les garde un an dans le navigateur ; les polices du premier affichage sont préchargées.
- La mise en page ne saute plus au chargement quand tu travailles en mode projet.

**Sous le capot**
- Un menu de debug (touche F3) : images par seconde, durée de chaque partie du dessin, graphique des dernières images, mémoire, état du monde ; et des interrupteurs pour changer la météo, l'heure, la vitesse, la cadence, ou couper une couche de dessin.
- `bureau.ts` et `world.ts` sont découpés en modules plus petits (réglages, branches, versions, enregistrements ; robot, déplacements, animation).

## v0.1.0 (14 octobre 2026)

La première version publique.

- Max, le chef de projet, et son équipe de vrais sous-agents Claude Code : recherche, code, design, rédaction, analyse.
- Le bureau en pixel art, dessiné en code : les robots vont à leur poste, et chaque bulle montre ce qu'ils font vraiment.
- Les rapports, les fichiers rendus, les sites créés affichés dans un écran (ordinateur ou téléphone), le code et ses versions.
- Le plan au tableau et son historique, toute l'équipe et ses outils, l'historique des agents passés au bureau.
- Rejouer une mission sans relancer l'équipe, une démo hors ligne.
- Le mode tournage (caméra automatique, cadre vertical), la visite guidée avec la voix de Max, le jukebox, et quelques surprises.
