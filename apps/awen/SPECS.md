# Awen — Spécifications techniques

Modèle de données du pattern et invariants des générateurs. Ce document fait foi
pour `src/engine/` ; toute évolution du modèle passe par ici d'abord.

## 1. Modèle de données

### 1.1 Pattern

```ts
type Pattern = {
  lengthSteps: PatternLength;     // 16 | 32 | 48 | 64 (1 à 4 mesures en 4/4, double-croche)
  tracks: Track[];
};

type PatternLength = 16 | 32 | 48 | 64;

type Track = {
  id: string;                     // stable, unique dans le pattern
  kind: 'melodic' | 'kick' | 'perc';
  instrumentId: string;           // référence le rack ('supersaw', 'kick-synth', 'kick-sampler', 'clap', …)
  steps: Step[];                  // INVARIANT : steps.length === pattern.lengthSteps
  // Mixage par piste
  volume: number;                 // dB, [-60, +6], défaut 0
  mute: boolean;
  solo: boolean;
  sendFx: number;                 // [0, 1], niveau vers le bus send (delay/reverb)
  // Spécifique kick
  followTrackId?: string;         // kick uniquement : si défini, les pitchs sont lus
                                  // sur cette piste (bassline/mélodie) au lieu de la pitch lane
};

type Step = {
  on: boolean;
  pitch?: number;                 // index de degré (voir 1.2) — pistes melodic et kick
  vel?: number;                   // [0, 1], défaut 0.8 ; absent = défaut
};
```

Hors pattern (dans le store, pas dans `Pattern`) : `bpm`, `scale` (tonique + mode),
`seed`, sélection d'instruments/params. Le pattern ne contient que ce que la grille
affiche et que le moteur lit pas à pas.

### 1.2 Représentation du pitch : index de degré

`Step.pitch` est un **index de degré dans la gamme courante**, pas une note MIDI :

- `0` = tonique de l'octave de référence de la piste ; `+7` = tonique une octave
  au-dessus (gammes à 7 degrés) ; valeurs négatives = en dessous.
- Conversion au moment du trigger : `scales.degreeToMidi(scale, rootMidi, degree)`.
- **Le snap gamme est donc garanti par construction** : il est impossible de stocker
  une note hors gamme. Changer de gamme re-mappe toute la grille sans opération.
- Plage mélodique : 2–3 octaves configurées par piste (degrés `0..20` typiquement).
- Trade-off assumé : changer de mode (naturelle → harmonique) change les hauteurs
  entendues à grille constante — c'est le comportement voulu.

### 1.3 Sémantique par type de piste

| Kind      | `pitch`                          | UI                                        |
|-----------|----------------------------------|-------------------------------------------|
| `melodic` | requis quand `on`                | piano roll simplifié, lignes = degrés      |
| `kick`    | optionnel ; ignoré si `followTrackId` | lane on/off + sous-lane de pitch, ou toggle « suivre » |
| `perc`    | absent (toujours ignoré)         | lane on/off + vélocité                     |

Kick avec `followTrackId` : au pas *i*, le moteur cherche le pitch actif au pas *i*
sur la piste suivie (dernière note démarrée ≤ *i* dans la mesure ; à défaut,
fondamentale de la gamme). Kick sans pitch résolu = kick non repitché (sample/synthé
à sa hauteur native).

### 1.4 Opérations sur le pattern (`engine/pattern.ts`)

Toutes **pures** : `(pattern, args) => Pattern` (nouvel objet, jamais de mutation).

- `createPattern(lengthSteps, trackDefs)` — steps initialisés `{ on: false }`.
- `toggleStep(pattern, trackId, stepIndex, pitch?)`
- `setStepVelocity`, `setStepPitch` — clamp/valide selon le kind (cf. 1.3).
- `resizePattern(pattern, newLength)` — extension : nouveaux pas off ; réduction :
  troncature (les données coupées sont perdues, l'UI confirme si non vide).
- `clearTrack(pattern, trackId)`
- Toute opération préserve les invariants de la section 2.

## 2. Invariants du modèle

Testés dans Vitest, valides après **toute** opération ou générateur :

1. `track.steps.length === pattern.lengthSteps` pour toute piste.
2. `pitch` défini ⟹ entier dans la plage de degrés de la piste ; jamais défini
   sur une piste `perc`.
3. `vel` défini ⟹ dans `[0, 1]`.
4. `melodic` : `on === true` ⟹ `pitch` défini.
5. `followTrackId` défini ⟹ pointe une piste existante de kind `melodic`,
   et uniquement sur une piste `kick`.
6. Les `id` de pistes sont uniques.

## 3. Générateurs

Tous dans `engine/`, **purs, seedés, testés** : `(pattern, params, rng) => Pattern`.
Jamais `Math.random`, jamais `Date`, jamais d'I/O. Le `rng` est un mulberry32.

### 3.1 Seed & reproductibilité (invariant maître)

- Seed global (uint32) affiché et saisissable dans l'UI.
- Chaque action génératrice consomme un flux dérivé : `mulberry32(hash(seed, actionCounter))`
  où `actionCounter` s'incrémente à chaque action. **Même seed + même séquence
  d'actions = même pattern**, indépendamment du timing ou de l'ordre des re-renders.
- « Nouveau seed » (`R`) tire un seed depuis un flux dédié et remet le compteur à zéro.
- Testé : rejouer une séquence d'actions donnée sur un seed donné produit un
  pattern identique (deep equal).

### 3.2 Mélodie markovienne (`markov.ts`)

- Chaîne de Markov d'ordre 1 sur les **degrés**, matrices de transition par
  caractère : `euphorique` (mouvements conjoints, résolutions sur 1/3/5),
  `dark` (mineure harmonique, sensible, sauts descendants), `erratique`
  (sauts larges, poids plus plats).
- Durées pondérées par caractère (double-croche, croche, noire) — en MVP une
  note = un pas `on`, les durées réelles arrivent en phase de polish.
- Modes d'écriture : **remplacer** (piste vidée d'abord) ou **compléter**
  (n'écrit que sur les pas off).
- Invariants : sortie dans la plage de degrés de la piste ; densité de notes
  bornée par les params ; pattern hors piste cible inchangé.

### 3.3 Bassline → kicks (`bassline.ts`)

- Entrée : piste mélodique. Par mesure : extraction de la fondamentale
  (degré le plus pondéré, poids = occurrences × vélocité, priorité aux temps forts),
  déclinée en fondamentale/quinte selon les params.
- Sortie : écrit les `pitch` des pas `on` de la piste kick (n'ajoute ni ne retire
  aucun trigger — le rythme du kick appartient à l'utilisateur ou à Mutate).
- Piste mélodique vide ⟹ pattern retourné inchangé.

### 3.4 Rythmes euclidiens (`euclid.ts`)

- `bjorklund(pulses, steps, rotation)` → tableau de booléens, appliqué aux pistes
  perc. Invariants : `pulses ≤ steps`, sortie de longueur `steps`, exactement
  `pulses` pas actifs, déterministe (pas de rng).

### 3.5 Mutate (`mutate.ts`)

- Perturbation contrôlée du pattern existant : déplace/ajoute/retire quelques pas,
  bruite les pitchs **dans la gamme** (±1 ou ±2 degrés).
- Params : intensité (proportion de pas touchés, bornée, défaut ~10 %), pistes cibles.
- Invariants : tous les invariants de la section 2 ; la densité de notes ne varie
  pas de plus de `intensité` ; un pattern vide reste vide (Mutate ne crée pas
  de matière ex nihilo).

### 3.6 Kit Kosmische (phase finale, pour mémoire)

Automate cellulaire (elementary CA, règle paramétrable) comme générateur de
séquences, même signature pure que les autres. Rien n'est implémenté avant la
phase 6.

## 4. Moteur audio (contrat)

- `AudioEngine` s'abonne au Transport via `scheduleRepeat('16n')` ; à chaque tick
  il lit **le pattern courant du store** (l'édition pendant la lecture est prise
  en compte au pas suivant) et appelle `instrument.trigger(step, time)` pour
  chaque pas actif, avec le `time` fourni par le Transport.
- Interface instrument commune : `{ trigger(step: ResolvedStep, time: number): void; dispose(): void }`
  où `ResolvedStep` contient le pitch résolu en MIDI/Hz et la vélocité effective.
- Bus : par piste → chaîne d'effets (distorsion) → mixbus ; sends delay/reverb ;
  master : `EQ3` → `Limiter` (obligatoire).
- Repitch sampler : `playbackRate = 2^(Δsemitones/12)` — la durée varie avec le
  pitch, assumé pour des kicks.

## 5. Export

- MVP : `Tone.Recorder` sur le master (webm/opus).
- Cible : `Tone.Offline` → WAV déterministe, boucles de 4/8/16 mesures, départ et
  arrêt sur la barre. Nom auto : `awen_hardstyle_seed4242_fmin_150bpm_8bars.wav`
  (`awen_<kit>_seed<seed>_<tonique><mode>_<bpm>bpm_<n>bars.wav`).
- Presets : `{ pattern, instruments, params, seed, bpm, scale }` en JSON —
  localStorage + export/import fichier. Champ `version` pour les migrations.
