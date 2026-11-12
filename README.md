# El Camino de Cempasúchil

Roguelike éducatif pour réviser l'espagnol (5e, A1-A2) sur la séquence **Día de Muertos**. Il se joue dans le navigateur, sans serveur ni compte élève.

> 🚧 **Étape 1 sur 6.** Le guide complet pour le professeur (mise en ligne sur GitHub Pages pas à pas, modification des questions sans programmer) arrivera à l'étape 6. Voir `docs/CONCEPTION.md` pour le plan.

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

`content/sequences/dia-de-muertos/questions/` : un fichier par thème (`vocabulario.json`, `conjugacion.json`, `gramatica.json`, `cultura.json`). Les ennemis sont dans `enemies.json`, les pouvoirs dans `items.json`, les réglages de la séquence dans `sequence.json`.

Après toute modification, lance `npm run valider` : il indique précisément ce qui ne va pas.

Les informations culturelles qui ne viennent pas des documents de cours sont listées dans [`A_VERIFIER.md`](A_VERIFIER.md).

## Partie « défi de classe »

Ajoute `?graine=MOT-12` à l'adresse du jeu, ou tape une graine sur l'écran d'accueil. Toute la classe aura alors les mêmes ennemis dans le même ordre.
