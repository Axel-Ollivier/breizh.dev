# breizh.dev

Portail développeur — .NET 8 Blazor Web App avec MudBlazor.

## Stack

- **.NET 8** — Blazor Web App (Server-side rendering + îlots interactifs)
- **MudBlazor** — Composants UI avec thème custom (light/dark)
- **Docker** — Conteneurisation et déploiement

## Prérequis

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Docker](https://docs.docker.com/get-docker/) (optionnel, pour le build conteneurisé)

## Lancer le projet

```bash
# Restaurer les dépendances
dotnet restore src/BreizhDev/BreizhDev.csproj

# Lancer en mode développement
dotnet run --project src/BreizhDev
```

L'application sera accessible sur `https://localhost:7210` (ou `http://localhost:5210`).

## Build de production

```bash
dotnet publish src/BreizhDev -c Release -o ./publish
```

## Docker

### Build local

```bash
docker build -t breizhdev .
```

### Lancer le conteneur

```bash
docker run -d --name breizhdev -p 8080:8080 breizhdev
```

L'application sera accessible sur `http://localhost:8080`.

## Structure

```
src/BreizhDev/
├── Components/
│   ├── Layout/          → MainLayout
│   ├── Shared/          → HeroSection, ProjectCard, TagBadge, ThemeToggle
│   └── Pages/           → Home, Projects, ProjectDetail, About
├── Content/
│   └── projects/        → projects.json
├── Models/              → Project
├── Services/            → ContentService
├── Theme/               → Thème MudBlazor custom
└── wwwroot/css/         → Styles globaux
```

## Contenu

### Projets

Les projets sont définis dans `Content/projects/projects.json` :

```json
[
  {
    "slug": "mon-projet",
    "title": "Mon projet",
    "description": "Description courte.",
    "tags": ["Blazor", ".NET"],
    "gitHubUrl": "https://github.com/user/repo",
    "demoUrl": "https://demo.example.com",
    "imageUrl": null
  }
]
```

## Mini apps (sous-domaines)

[Bingo multijoueur](apps/bingo/README.md) est disponible sous `/bingo/` sur le
domaine existant, avec Vue 3, ASP.NET Core 10 et SignalR. Ses deux conteneurs
sont construits et déployés par la même CI, sans modification DNS.

[Krampouezh](apps/krampouezh/README.md) propose un top 100 partagé et le rang de
chaque score parmi toutes les parties enregistrées, avec ASP.NET Core 10 et SQLite.

En plus du site principal, le dépôt héberge des **mini apps** autonomes,
chacune servie sur son propre sous-domaine via un conteneur dédié. Le routage est
géré par **Traefik** (labels Docker dans `docker-compose.prod.yml`).

```
apps/
├── prout/               → prout.breizh.dev (page statique, servie par nginx)
│   ├── index.html
│   └── Dockerfile
├── krampouezh/          → krampouezh.breizh.dev (jeu canvas et classement partagé)
│   ├── index.html
│   ├── server/          → API ASP.NET Core 10, scores persistés avec SQLite
│   └── Dockerfile
├── awen/                → awen.breizh.dev (séquenceur hardstyle génératif — Vite + React + Tone.js)
│   ├── src/             → engine (logique pure) / audio (Tone) / ui (React) / state (Zustand)
│   └── Dockerfile       → build Vite puis nginx statique
├── riboul/              → riboul.breizh.dev (jeu d'apéro façon Picolo, page statique)
│   ├── index.html
│   └── Dockerfile
└── idle-consulting/     → idle.breizh.dev (ESN Idle, jeu incrémental de consulting — Vite + React)
    ├── src/             → components / game / hooks / utils
    └── Dockerfile       → build Vite puis nginx statique
```

### Ajouter une nouvelle mini app

1. Créer `apps/<nom>/` avec le code de l'app et un `Dockerfile`.
2. Ajouter un service dans `docker-compose.prod.yml` avec les labels Traefik
   (`Host(\`<nom>.breizh.dev\`)` + port interne du conteneur).
3. Ajouter l’app dans `.github/scripts/deploy_plan.py` avec son image, son contexte
   de build, son Dockerfile et le nom de son service Compose.
4. Faire pointer le DNS `<nom>.breizh.dev` vers le serveur.

## Déploiement

Le workflow `CI / Deploy` détecte les applications touchées sur l’ensemble du push
vers `main`, ou depuis le point de divergence d’une pull request. Il appelle les
vérifications Bingo et Krampouezh uniquement lorsqu’elles sont concernées, puis
construit les images sélectionnées.

Sur une pull request, les images sont seulement construites. Sur `main`, elles
sont publiées sur GHCR et seuls les services sélectionnés sont mis à jour par
SSH (`docker compose pull` puis `up -d --no-deps`).

| Modification | Vérifications et images concernées |
|---|---|
| `apps/krampouezh/` | Krampouezh uniquement |
| `apps/bingo/` | Bingo, frontend et backend |
| `src/BreizhDev/`, `Dockerfile` ou `.dockerignore` racine | Site principal |
| Une autre mini app | Cette app uniquement |
| Compose, workflow de déploiement ou sélecteur commun | Toutes les apps |
| Documentation seule | Aucun build ni déploiement |

Les workflows `bingo-check.yml` et `krampouezh-check.yml` sont appelés par le
workflow parent ; ils n’ont pas de déclencheurs indépendants. Un contrôle sauté
parce qu’une app n’a pas changé ne bloque pas les autres apps. Un contrôle en
échec bloque la publication et le déploiement.

Les tests du sélecteur s’exécutent dans le job `changes`, et localement avec :

```bash
python3 -m unittest discover -s .github/scripts -p 'test_*.py'
```

### Configuration requise

Ajouter ces **secrets** dans les paramètres du dépôt GitHub (`Settings > Secrets and variables > Actions`) :

| Secret | Description |
|---|---|
| `SSH_HOST` | Adresse IP ou hostname du serveur |
| `SSH_USER` | Utilisateur SSH |
| `SSH_KEY` | Clé privée SSH (contenu complet du fichier) |
| `SSH_PORT` | Port SSH (optionnel, 22 par défaut) |

### Configuration serveur

Le serveur distant doit avoir Docker installé. Le CI/CD s'occupe de :

- Pull l'image depuis `ghcr.io`
- Stopper et supprimer l'ancien conteneur
- Lancer le nouveau conteneur sur le port 8080

Un reverse proxy (Nginx, Caddy) est recommandé devant le conteneur pour gérer HTTPS.

## Licence

Voir [LICENSE](LICENSE).
