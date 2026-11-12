# El Camino de Cempasúchil

Roguelike éducatif pour réviser l'espagnol (5e, A1-A2) sur la séquence **Día de Muertos**. Il se joue dans le navigateur, sans serveur ni compte élève.

> 🚧 **Étape 3 sur 6.** Le guide complet pour le professeur (mise en ligne sur GitHub Pages pas à pas, modification des questions sans programmer) arrivera à l'étape 6. Voir `docs/CONCEPTION.md` pour le plan.

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
