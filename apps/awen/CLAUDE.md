# Awen — Séquenceur hardstyle génératif (navigateur)

Séquenceur hardstyle/rawstyle 100 % front : grille éditable à la main + générateurs
seedés qui écrivent dedans, lecture temps réel via Web Audio (Tone.js), export audio
des boucles. Pas de backend, déployé en statique sur `awen.breizh.dev` (mini app du
monorepo `breizh.dev`, voir la racine du dépôt pour les conventions Traefik/deploy).

**Principe directeur : la grille (le `Pattern` dans le store) est la source de vérité
unique.** Les générateurs écrivent dedans, l'utilisateur aussi, le moteur audio la lit.
Tout ce qui est généré reste éditable à la main.

## Stack

- Vite + React 18 + TypeScript **strict** (aucun `any` implicite, pas de `!` gratuit)
- Tone.js : synthèse, effets, scheduling
- Tailwind pour l'UI
- Zustand pour l'état (pattern + params + seed)
- Vitest pour la logique pure (`src/engine/`)
- ESLint + Prettier, config sobre

## Commandes

Toutes depuis `apps/awen/` :

```bash
npm run dev        # serveur Vite
npm test           # Vitest (engine/ uniquement — logique pure)
npm run build      # tsc --noEmit + vite build
npm run lint       # ESLint
```

## Architecture

```
src/
  engine/    # logique pure, ZÉRO import React ou Tone — 100 % testable
    pattern.ts   # modèle + opérations (toggle, clear, resize)
    markov.ts    # génération mélodique
    euclid.ts    # Bjorklund
    bassline.ts  # mélodie -> pitchs de kicks
    prng.ts      # mulberry32 seedé
    scales.ts    # gammes, degré -> note MIDI
  audio/     # encapsulation Tone.js, seul dossier qui importe 'tone'
    AudioEngine.ts   # transport, lecture du pattern, bus, cycle de vie
    instruments/     # une classe par instrument, interface commune trigger(step, time)
  ui/        # React uniquement, ne touche JAMAIS Tone directement
  state/     # store Zustand (pattern, params, seed)
```

### Règles d'or (non négociables)

1. **React ne pilote jamais l'audio et ne re-render jamais à la cadence audio.**
   Le moteur lit le store, l'UI écrit dans le store. La tête de lecture est un
   overlay positionné piloté par `Tone.Draw` — jamais de `setState` par pas.
2. **Tout le scheduling passe par `Tone.Transport`** (`scheduleRepeat` au pas,
   `time` fourni aux triggers). Jamais `setTimeout`/`setInterval`/`Date.now()`.
3. **`engine/` est pur** : pas d'import React ni Tone, pas de `Math.random`
   (PRNG mulberry32 seedé uniquement), pas de mutation — les opérations
   retournent un nouveau `Pattern`.
4. **`Tone.start()` uniquement après un geste utilisateur.**
5. **`dispose()` systématique** des nodes Tone remplacés ; teardown global en dev
   pour le HMR de Vite (sinon fuites et sons fantômes).
6. **Limiter obligatoire sur le master** dès qu'il y a de la distorsion (phase 3+) ;
   gain staging par piste.
7. Ajouter un instrument au rack = implémenter l'interface commune
   (`trigger(step, time)`), sans toucher au moteur.

## Direction musicale

Hardstyle / rawstyle (ouverture uptempo). BPM défaut **150** ; l'UI accepte
60–220 (le kit ne verrouille pas le tempo — séquences lentes bienvenues).
Gammes défaut : mineure naturelle et mineure harmonique. Le kick est central :
il doit pouvoir être **pitché pour suivre la bassline** dans la grille — c'est LA
feature. Résolution double-croche, patterns de 1 à 4 mesures (16–64 pas).

## UI

Esthétique instrument hardware sombre. Palette imposée : fond `#181A1A`, texte
`#FAFAEC`, accents `#2A9B77` (vert) et `#2A7AAA` (bleu). Titres en **Exo 2 Black
Italic**. Grille au centre (mélodie en haut, kick + pitch lane dessous, percus en
bas), rack et mixage sur les côtés. Grille en DOM/React avec cellules mémoïsées
(pas de canvas pour le MVP). Desktop d'abord, mobile hors scope.

Raccourcis : `espace` play/stop, `M` mutate, `G` générer, `R` nouveau seed, `E` export.

## Pièges connus

- `Tone.Recorder` sort du webm/opus, pas du WAV : le vrai export passe par
  `Tone.Offline` (déterministe, calé sur la barre).
- Repitch de samples par `playbackRate` : la durée change avec le pitch —
  acceptable pour des kicks, documenté.
- Zaag/screech en pure synthèse = gros chantier : le kick synthé vise un piep/raw
  jouable, le sampler (import de samples perso) reste la voie pro.
- Jitter : toujours le `time` du callback Transport, jamais l'horloge JS.

## Références

- `SPECS.md` : modèle de données du pattern, invariants des générateurs.
- `TASKS.md` : découpage en phases, avancement.
- Chaque phase doit compiler, être jouable, et se terminer par un commit + une
  passe de review. Un commit par étape cohérente.
