# breizh.dev

Portfolio et blog personnel — .NET 8 Blazor Web App avec MudBlazor.

## Stack

- **.NET 8** — Blazor Web App (Server-side rendering + îlots interactifs)
- **MudBlazor** — Composants UI avec thème custom (light/dark)
- **Markdig** — Rendu Markdown avec extensions avancées
- **YamlDotNet** — Parsing du front-matter YAML des articles

## Prérequis

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

## Lancer le projet

```bash
# Restaurer les dépendances
dotnet restore src/BriezhDev/BriezhDev.csproj

# Lancer en mode développement
dotnet run --project src/BriezhDev
```

L'application sera accessible sur `https://localhost:7210` (ou `http://localhost:5210`).

## Build de production

```bash
dotnet publish src/BriezhDev -c Release -o ./publish
```

## Structure

```
src/BriezhDev/
├── Components/
│   ├── Layout/          → MainLayout, NavMenu
│   ├── Shared/          → HeroSection, ProjectCard, ArticleCard, TagBadge, ThemeToggle
│   └── Pages/           → Home, Projects, Articles, About, détails
├── Content/
│   ├── articles/        → Fichiers .md avec front-matter YAML
│   └── projects/        → projects.json
├── Models/              → Article, Project
├── Services/            → ContentService, MarkdownService
├── Theme/               → Thème MudBlazor custom
└── wwwroot/css/         → Styles globaux
```

## Contenu

### Articles

Les articles sont des fichiers `.md` dans `Content/articles/` avec un front-matter YAML :

```yaml
---
title: "Titre de l'article"
date: 2025-01-15
tags:
  - Blazor
  - .NET
summary: "Résumé court de l'article."
---
```

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

## Déploiement

Le déploiement est automatisé via GitHub Actions. Un push sur `main` déclenche :

1. Build et publish de l'application .NET 8
2. Déploiement sur le serveur distant via SSH (rsync)
3. Redémarrage du service systemd

### Configuration requise

Ajouter ces **secrets** dans les paramètres du dépôt GitHub (`Settings > Secrets and variables > Actions`) :

| Secret | Description |
|---|---|
| `SSH_HOST` | Adresse IP ou hostname du serveur |
| `SSH_USER` | Utilisateur SSH |
| `SSH_KEY` | Clé privée SSH (contenu complet du fichier) |
| `SSH_PORT` | Port SSH (optionnel, 22 par défaut) |

### Configuration serveur

Sur le serveur distant, créer un service systemd `/etc/systemd/system/briezhdev.service` :

```ini
[Unit]
Description=breizh.dev Blazor App
After=network.target

[Service]
WorkingDirectory=/var/www/briezhdev
ExecStart=/usr/bin/dotnet BriezhDev.dll
Restart=always
RestartSec=10
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://localhost:5000

[Install]
WantedBy=multi-user.target
```

Puis activer le service :

```bash
sudo systemctl enable briezhdev
sudo systemctl start briezhdev
```

Un reverse proxy (Nginx, Caddy) est recommandé devant l'application pour gérer HTTPS.

## Licence

Voir [LICENSE](LICENSE).
