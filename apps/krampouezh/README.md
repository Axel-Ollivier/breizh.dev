# Krampouezh

Jeu d'empilement de crêpes sur canvas, servi avec son API par ASP.NET Core 10.
Le classement affiche les **100 meilleurs scores**. Tous les scores envoyés sont
conservés : le rang d'une partie est calculé parmi la totalité des scores, même
au-delà de la 100e place. À égalité, le score enregistré en premier passe devant.
Les points incluent les bonus de combo du jeu.

En fin de partie, le joueur peut envoyer son score avec un pseudo. Le pseudo
et l'identifiant du dernier score envoyé sont mémorisés dans le navigateur.
Chaque partie envoyée compte séparément ; les pseudos ne sont pas des comptes
et ne sont pas uniques. Les scores sont déclarés par le navigateur : ce
classement convivial ne vérifie pas le déroulement des parties côté serveur.

## Développement

Depuis la racine du dépôt, avec le SDK .NET 10 :

```bash
dotnet run --project apps/krampouezh/server --urls http://localhost:5080
dotnet test apps/krampouezh/server.tests/Krampouezh.Tests.csproj
```

Ouvrir `http://localhost:5080`. La base locale est créée dans
`apps/krampouezh/server/data/leaderboard.db`. La variable `Leaderboard__DataPath`
permet de choisir un autre emplacement. Le serveur doit pouvoir écrire dans
le dossier contenant la base.

Pour vérifier les parcours dans Chromium, lancer le serveur ci-dessus avec une
base de test, puis exécuter dans un autre terminal (Python 3.12+) :

```bash
python -m pip install playwright==1.62.0
python -m playwright install chromium
python apps/krampouezh/test-browser.py
```

Le script couvre notamment la saisie au clavier, la nouvelle tentative d'envoi,
le rang au-delà du top 100, les petits écrans et un aller-retour avec l'API réelle.
Il ajoute un score de test : ne pas le lancer contre la production.
`KRAMP_BASE_URL` permet de changer l'URL et `CHROMIUM_EXECUTABLE` de sélectionner
un Chromium déjà installé.

## API

`GET /api/leaderboard` renvoie `{ entries, total, rank }` :

- `entries` : jusqu'à 100 éléments `{ id, name, score, createdAt }`, triés par
  score décroissant, puis par ordre d'enregistrement ;
- `total` : nombre de scores enregistrés, sans limite à 100 ;
- `rank` : rang global, à partir de 1, du score identifié par le paramètre
  optionnel `?id=<uuid>` ; `null` si aucun score n'est trouvé.

`POST /api/leaderboard` accepte un objet JSON :

```json
{ "id": "ee50f688-555b-481c-a9ac-4bb57132ac17", "name": "Anna", "score": 42 }
```

L'identifiant doit être un UUID non nul, le pseudo contenir 2 à 20 caractères
après suppression des espaces aux extrémités, et le score être un entier de 1
à 1 000 000. La réponse a la même forme que le GET, avec le rang global du score
envoyé. Réessayer le même identifiant et le même contenu ne crée pas de doublon ;
un contenu différent sous le même identifiant est refusé. Les envois sont limités
à 30 par minute pour l'ensemble du serveur.

## Docker et persistance

```bash
docker build -t krampouezh apps/krampouezh
docker run --rm -p 5080:8080 -v krampouezh-data:/app/data krampouezh
```

Pour vérifier l'image construite et la conservation des scores après recréation
du conteneur :

```bash
KRAMP_DOCKER_IMAGE=krampouezh python3 apps/krampouezh/test-container.py
```

Ce test utilise un conteneur et un volume temporaires sur le Docker local, puis
les supprime. Sans variable, il teste l'image `krampouezh:check` utilisée en CI.

L'image s'exécute avec l'utilisateur non privilégié `app`. Le service de
`docker-compose.prod.yml` utilise une seule instance et le volume nommé
`krampouezh-data`, monté sur `/app/data`. Le routage Traefik du sous-domaine
reste identique et utilise le port interne 8080.

Les mises à jour du conteneur conservent ce volume. Ne pas supprimer le volume
(`docker compose down -v` l'effacerait). Sauvegarder la base avec l'API de
sauvegarde SQLite ou arrêter le service avant de copier le dossier de données ;
une copie isolée du fichier `.db` pendant des écritures peut être incomplète.

Le workflow `krampouezh-check.yml` exécute les tests du serveur et du navigateur,
valide Compose, construit l'image et vérifie la persistance dans le conteneur.
Le déploiement attend ces vérifications.
