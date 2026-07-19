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

En plus du site principal, le dépôt héberge des **mini apps front** autonomes,
chacune servie sur son propre sous-domaine via un conteneur dédié. Le routage est
géré par **Traefik** (labels Docker dans `docker-compose.prod.yml`).

```
apps/
└── prout/               → prout.breizh.dev (page statique, servie par nginx)
    ├── index.html
    └── Dockerfile
```

### Ajouter une nouvelle mini app

1. Créer `apps/<nom>/` avec le code de l'app et un `Dockerfile`.
2. Ajouter un service dans `docker-compose.prod.yml` avec les labels Traefik
   (`Host(\`<nom>.breizh.dev\`)` + port interne du conteneur).
3. Ajouter une entrée dans la matrice `build-and-push` du workflow
   `.github/workflows/deploy.yml` (`name` / `context` / `dockerfile`).
4. Faire pointer le DNS `<nom>.breizh.dev` vers le serveur.

## Déploiement

Le déploiement est automatisé via GitHub Actions. Un push sur `main` déclenche :

1. Build de l'image Docker
2. Push sur GitHub Container Registry (`ghcr.io`)
3. Déploiement sur le serveur distant via SSH (docker pull + run)

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
