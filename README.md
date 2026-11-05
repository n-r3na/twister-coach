# Bot Poker Twister (3 joueurs, hyper-turbo)

Un conseiller de décisions pour les parties Twister de Betclic : tu entres la situation, il te dit quoi faire et pourquoi, avec des mots simples.

> ⚠️ Outil d'entraînement. Utiliser une aide en temps réel **pendant** une partie en argent réel est interdit par les règles de Betclic et peut entraîner la fermeture du compte. Utilise-le pour t'entraîner, revoir tes mains après une partie, ou sur des tables gratuites.

## Lancer le bot

Double-clique sur `index.html` : il s'ouvre dans ton navigateur. Rien à installer.

## Mode rapide (page principale)

Règle d'abord **tes jetons** avec la barre (glisse à la souris), les **blindes** avec ‹ › et **3 ou 2 joueurs**. À 2 joueurs, l'adversaire a 1500 − tes jetons ; à 3, les deux autres se partagent le reste. Ces réglages sont gardés d'une main à l'autre.

Puis tu touches seulement **tes 2 cartes**, puis **les cartes du milieu** (une valeur, puis une couleur). Au clavier : `a` puis `s` = As de pique (`s` pique, `h` cœur, `d` carreau, `c` trèfle, `t` ou `0` = 10). `Retour arrière` efface la dernière carte, `Entrée` lance une nouvelle main.

En bas, indique ce que fait **l'adversaire** : **Rien** (il n'a pas encore misé ou il a checké), **Suit**, **Relance** ou **Tapis**. Le bouton revient sur « Rien » à chaque nouvelle carte au milieu, puisque c'est un nouveau tour de mises.

Le bot répond par 3 verdicts :

- **Vas-y** : tu peux mettre tous tes jetons (faire tapis, ou suivre un tapis).
- **Seulement si personne n'a fait tapis** / **Prudence** : attaque en premier ou joue pas cher, mais couche-toi face à un tapis.
- **Couche-toi** : checke si c'est gratuit, sinon abandonne.

Il part du principe que les adversaires sont **agressifs** (Twister à 5 €, 500 jetons, beaucoup de tapis) : avant le flop, il suppose qu'ils font tapis avec ~45 % des mains à 10 BB (65 % en tête-à-tête), plus quand les tapis sont courts. Le seuil pour suivre vient de la cote du pot de ton tapis, plus une marge de prudence. Avec 15 BB ou moins, « attaquer en premier » est calculé par le solveur push/fold contre des adversaires qui suivent large ; après le flop, qu'ils misent avec les 2/3 de leurs mains. Les réglages sont en haut de `js/quick.js`.

## Mode détaillé (`avance.html`)

Pour analyser une main précisément : jetons de chacun, blindes, actions des adversaires, pot et mises.

## Comment il décide

| Situation | Méthode |
|---|---|
| 13 grosses blindes ou moins, personne n'est entré | **Équilibre de Nash push/fold** calculé pour tes tapis exacts (3 joueurs ou tête-à-tête) |
| Quelqu'un est à tapis | Gain moyen (EV) de suivre contre la range de tapis supposée de l'adversaire, pots secondaires compris |
| Quelqu'un a relancé ou limpé | Comparaison tapis / suivre / se coucher ; la range de suivi de l'adversaire et ta range de tapis s'ajustent l'une à l'autre |
| Plus de 13 BB, personne n'est entré | Ranges de relance selon la position |
| Après le flop | Simulation de 5 000 fins de main contre la range estimée de l'adversaire (resserrée quand il mise), cote du pot, tirages, ratio tapis/pot |

- Les équités préflop viennent d'une table 169 × 169 mains calculée par simulation (`js/equity_data.js`).
- Les gains sont calculés en **ICM** : en mode « le gagnant prend tout » (le cas normal du Twister), ça revient à compter les jetons ; en mode jackpot (2e et 3e payés), le bot devient plus prudent.
- Le réglage **Style des adversaires** élargit (agressif) ou resserre (serré) les mains qu'on leur prête.

## Fichiers

- `index.html`, `css/quick.css`, `js/quick.js`, `js/quick-ui.js` : le mode rapide
- `avance.html`, `css/style.css`, `js/app.js` : le mode détaillé
- `js/cards.js` : cartes et évaluateur de mains
- `js/engine.js` : équités, ranges, ICM, solveur push/fold
- `js/preflop.js`, `js/postflop.js` : la logique de décision
- `tools/gen_equity.js` : régénère la table d'équités ; `tools/test.js` : tests sur des situations types

Lancer les tests (macOS) :

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tools/test.js
```
