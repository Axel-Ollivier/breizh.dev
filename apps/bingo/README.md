# Bingo entre amis

Jeu mobile en français pour **4 à 10 joueurs**, host compris :
`https://breizh.dev/bingo/`, invitation `https://breizh.dev/bingo/ABC123`.

## Lancer en développement

Prérequis : Node.js 22 et SDK .NET 10. Depuis la racine du dépôt, dans deux
terminaux de développement :

```sh
dotnet run --project apps/bingo/backend/Bingo.csproj --urls http://127.0.0.1:5080
```

```sh
cd apps/bingo/frontend
npm ci
npm run dev -- --host 0.0.0.0
```

Ouvrir `http://localhost:5173/bingo/`. Vite relaie `/bingo/api` et `/bingo/hub`
vers le backend. Plusieurs navigateurs ou profils privés représentent plusieurs
joueurs ; plusieurs onglets du même navigateur retrouvent la même identité.

```sh
dotnet test apps/bingo/backend.tests/Bingo.Tests.csproj --configuration Release
cd apps/bingo/frontend
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Les tests couvrent les règles métier, la confidentialité, les permissions,
la synchronisation de clients SignalR et les parcours mobiles dans Chromium.
Le workflow `Bingo checks` exécute ces contrôles et construit les deux images
sans les publier. `test-routing.py` démarre ces images derrière un Traefik local,
réutilise les règles du Compose de production et vérifie les URL de lobby, les
assets, l'API, la connexion SignalR WebSocket et l'absence de collision avec le
site principal sur les deux noms de domaine. Ce test reste isolé du VPS :

```sh
docker build -t bingo-frontend:check apps/bingo/frontend
docker build -t bingo-backend:check apps/bingo/backend
python3 apps/bingo/test-routing.py
```

## Architecture et règles choisies

- `frontend/` : Vue 3 + TypeScript + Vite, client SignalR, interface adaptée au
  téléphone. Toute la grille tient en largeur ; toucher une case ouvre son détail.
- `backend/` : ASP.NET Core 10, logique métier testable, stockage en mémoire,
  modifications sérialisées par lobby et nettoyage périodique côté serveur.
  Le hub est `/bingo/hub`, la santé `/bingo/api/health`.
- Le serveur décide des identités, autorisations, tirages, scores, bonus et délais.
  Chaque destinataire reçoit son propre état : avant le départ, seuls ses mots
  sont transmis ; ensuite, seules ses gorgées et celles des cases validées le sont.
- Chaque joueur fournit N mots pour N joueurs. Les N² cases sont librement
  mélangées, sans contrainte de ligne ou colonne. Les doublons sont autorisés.
  Pseudos de 2 à 24 caractères, uniques sans distinction de casse ; mots non vides
  de 60 caractères maximum ; budget entier de 0 à 100 par joueur.
- Le mode est commun : en manuel, la somme peut être inférieure au budget ; en
  aléatoire, le serveur utilise exactement le budget, en autorisant les zéros
  et les fortes concentrations. Le tirage est conservé jusqu'à la revanche.
- Scores et combinaisons sont recalculés sur les cases actuellement validées.
  Les bonus sont séparés du classement : moyenne arrondie à l'entier le plus
  proche (0,5 vers le haut), puis ×2 pour chaque grande diagonale ; chaque joueur
  absent d'une combinaison reçoit le bonus entier.
- Les mots déjà saisis sont conservés autant que possible quand N change.
  Le lancement attend que chaque préparation soit conforme à la nouvelle taille.
  Les couleurs doivent être choisies à nouveau après une revanche.

## Sessions, déconnexions et limites

Le jeton de session est enregistré dans le navigateur pour retrouver sa place.
La récupération par pseudo est réservée à une place déconnectée et renouvelle
son jeton. Le host doit en plus fournir sa clé de récupération personnelle :
il peut la copier depuis le lobby et la conserver sur son téléphone. Connaître
son pseudo ne donne jamais ses droits. Sans jeton ni clé, le rôle du host ne
peut pas être récupéré ; il n'est jamais transféré automatiquement.

Ce jeu entre amis n'a pas de comptes : un pseudo seul peut récupérer une place
ordinaire déconnectée. Les liens d'invitation et la clé du host doivent rester
entre les participants. Aucun spectateur ni nouvel inscrit après le départ.

Une déconnexion ne retire pas les cases. Sans host connecté, les validations
sont bloquées. Quand tout le monde est déconnecté, le serveur conserve le lobby
**60 secondes**, puis le supprime. La configuration
`Bingo__DisconnectGraceSeconds` règle ce délai ; `Bingo__MaxLobbies` limite les
lobbies en mémoire (500 par défaut).

Une manche expire **6 heures après son lancement**, même après une fin manuelle
ou automatique ; se reconnecter ne prolonge pas ce délai. Le serveur ferme le
lobby, prévient les clients et libère les données. Une revanche crée une nouvelle
manche avec le même code, les mêmes participants et les paramètres précédents,
mais efface les préparations, couleurs, grille et scores.

« Terminer la manche » affiche le résultat et autorise la revanche. Les cases
restent corrigeables jusqu'à la revanche ; dévalider une case après une fin
automatique rouvre la manche. « Fermer le lobby » est définitif pour tous.

**Une seule instance du backend. Aucun stockage persistant : un redémarrage,
une mise à jour ou une panne du backend fait perdre les lobbies et les parties.**
Aucun service externe ni base de données n'est nécessaire.

## Déploiement depuis GitHub

Les Dockerfiles utilisent des builds multiétapes : Vue vers nginx et .NET 10
vers l'image ASP.NET exécutée sans root. Le Compose de production ajoute
`bingo-frontend` et `bingo-backend` au réseau Docker externe existant `web`.
Traefik conserve les chemins complets et relaie SignalR, y compris WebSocket :

| Chemin sur breizh.dev ou www.breizh.dev | Service | Priorité |
| --- | --- | --- |
| `/bingo/api`, `/bingo/api/*`, `/bingo/hub`, `/bingo/hub/*` | Backend, port 8080 | 300 |
| `/bingo`, `/bingo/*` | Frontend, port 80 | 200 |
| Site principal | Application existante | 10 |

Le préfixe est délimité : `/bingox` reste au site principal. Vite utilise
`base: '/bingo/'` ; nginx redirige `/bingo` et assure le fallback SPA pour
`/bingo/ABC123`. Un asset absent renvoie 404. Les routes API/hub ne reçoivent
jamais le HTML du frontend. Aucun CORS, nouveau domaine ou changement DNS requis.

Les images `ghcr.io/axel-ollivier/bingo-frontend` et `bingo-backend` rejoignent la
matrice existante. Les secrets et le transfert SSH existants sont réutilisés.
La branche et la PR exécutent uniquement les vérifications : **pas de push
d'image ni de déploiement de production**. Après validation et fusion de la PR
vers `main` depuis GitHub sur téléphone, `Deploy` vérifie le bingo, construit et
publie les images, puis déploie le Compose sur le VPS. Il suffit de suivre ce
workflow jusqu'à sa réussite et d'ouvrir `/bingo/` ; aucune commande sur téléphone
ni connexion manuelle au VPS n'est nécessaire.
