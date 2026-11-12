# El Camino de Cempasúchil

Roguelike éducatif pour réviser l'espagnol (5e, A1-A2) sur la séquence **Día de Muertos**. Il se joue dans le navigateur, sans serveur ni compte élève.

> 🚧 **Étape 5 sur 6.** Le guide complet pour le professeur (mise en ligne sur GitHub Pages pas à pas, modification des questions sans programmer) arrivera à l'étape 6. Voir `docs/CONCEPTION.md` pour le plan.

## Lancer le jeu sur ton ordinateur

Il faut [Node.js](https://nodejs.org) (version 20 ou plus). Dans un terminal, depuis ce dossier :

```bash
npm install
```

```bash
npm run dev
```

Puis ouvre l'adresse affichée (en général http://localhost:5173).

## Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | lance le jeu en local |
| `npm run valider` | vérifie toute la banque de questions (champs, doublons, réponse parmi les distracteurs…) |
| `npm test` | lance les tests automatiques |
| `npm run equilibrage` | simule des centaines de parties et affiche taux de victoire et durées |
| `npm run build` | prépare la version à mettre en ligne (dossier `dist/`) |

## Où sont les questions ?

`content/sequences/dia-de-muertos/questions/` : un fichier par thème (`vocabulario.json`, `conjugacion.json`, `gramatica.json`, `cultura.json`). Les autres fichiers du même dossier :
- `enemies.json` : les ennemis et leurs comportements ;
- `items.json` : les aides et les reliques ;
- `synergies.json` : les ensembles de reliques ;
- `events.json` : les événements en espagnol ;
- `sequence.json` : les réglages de la séquence (actes, carte, noms des salles, repas du Tianguis…).

### Les types de questions

| `type` | Ce que fait l'élève | Champs propres |
|---|---|---|
| `qcm` | choisit parmi 4 réponses (ou écrit si `writable: true`) | `answer`, `accept`, `distractors`, `scene` (facultatif : image de scène) |
| `ecrit` | écrit la réponse | `answer`, `accept`, `distractors` |
| `ecoute` | écoute (voix du navigateur), puis choisit ou écrit | `answer`, `distractors`, `say` (facultatif : texte lu) |
| `vrai-faux` | répond Verdadero ou Falso | `answer` : `"verdadero"` ou `"falso"` |
| `ordre` | remet les étiquettes dans l'ordre (glisser-déposer) | `answer`, `tokens` (facultatif), `extra` (étiquettes pièges) |
| `association` | relie chaque mot à son image | `pairs` : `[["la vela", "🕯️"], …]` |
| `scene` | place les objets sur une scène | `scene` : `{ "decor": "ofrenda", "items": [{ "object": "vela", "row": "arriba", "col": "izquierda" }] }` |

Les décors et les objets des scènes sont dans `scenes.json`.

Après toute modification, lance `npm run valider` : il indique précisément ce qui ne va pas.

Les informations culturelles qui ne viennent pas des documents de cours sont listées dans [`A_VERIFIER.md`](A_VERIFIER.md).

## Partie « défi de classe »

Ajoute `?graine=MOT-12` à l'adresse du jeu, ou tape une graine sur l'écran d'accueil. Toute la classe aura alors la même carte et les mêmes salles.

## Progression des élèves (sur l'appareil)

- **Profils locaux** : un avatar et un pseudo par élève, sur cet appareil uniquement (pratique pour les PC partagés). Rien n'est envoyé sur Internet.
- **Révision (système de Leitner)** : chaque question ratée revient plus souvent dans les parties suivantes, jusqu'à ce qu'elle soit réussie plusieurs fois. L'écran « Mon carnet » montre les notions à revoir.
- **Personnages** (rubrique `characters` de `sequence.json`), **cartes de lotería** (une par ennemi et par objet), **succès**, et **Nivel de Calavera** (difficulté qui augmente après chaque victoire).
- **Code de fin** : à la fin de chaque partie, l'élève obtient un code de 19 caractères (et un QR) qui résume son résultat et les notions ratées. L'espace professeur (étape 5) permettra de le décoder.

## Espace professeur

Sur l'écran d'accueil, clique sur **« Espace professeur »** (en bas à droite), ou ajoute `#prof` à l'adresse du jeu.

- **Code d'accès par défaut : `profe2026`.** Change-le dans l'onglet « Réglages de classe ». Ce n'est pas une vraie protection : il évite seulement que les élèves modifient la banque par erreur.
- **Réglages de classe** : choisis les thèmes, les types de questions, le chrono, la part de réponses écrites, la tolérance aux accents, et éventuellement une graine (défi de classe). Le jeu calcule un **code de classe** de 6 caractères, plus un lien et un QR code à projeter. Les élèves tapent le code sur l'écran d'accueil, ou ouvrent le lien : les réglages s'appliquent tout seuls.
- **Questions** : recherche, filtres, activer/désactiver une question d'un clic, modifier une question (l'éditeur vérifie tout en direct), en créer une nouvelle.
- **Import / export** : toute la banque en **CSV** (s'ouvre dans Excel ou LibreOffice, séparateur point-virgule) ou en JSON. Tu peux modifier le CSV dans un tableur puis le réimporter : le jeu indique ce qui est nouveau, modifié ou invalide (avec le numéro de ligne).
- **Codes élèves** : colle les codes de fin de partie (un par ligne, avec le prénom devant si tu veux). Tu vois le résultat de chacun et les notions les plus ratées de la classe.
- **Séquence** : exporte la séquence complète pour en préparer une autre, ou importe une séquence préparée ailleurs.

⚠️ Les modifications faites dans l'espace professeur restent **sur ton appareil**. Pour que **tous les élèves** aient tes nouvelles questions, exporte « Mes ajouts et modifications » (JSON) et place ce fichier dans `content/sequences/dia-de-muertos/questions/` de ton dépôt GitHub. La marche à suivre détaillée arrive à l'étape 6. Les réglages de classe, eux, passent simplement par le code de classe.
