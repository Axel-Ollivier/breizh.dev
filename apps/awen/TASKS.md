# Awen — Découpage par phases

Chaque phase doit compiler, être jouable, et se terminer par un commit + une passe
de review. Un commit par étape cohérente. MVP = fin de phase 4.

## Phase 1 — Scaffold

- [x] Scaffold Vite + React 18 + TypeScript strict dans `apps/awen/`
- [x] Tailwind (palette : fond `#181A1A`, texte `#FAFAEC`, accents `#2A9B77`/`#2A7AAA`), police Exo 2
- [x] ESLint + Prettier (config sobre) + Vitest branché
- [x] Arborescence `src/{engine,audio,ui,state}` + garde-fous d'imports (engine sans React/Tone)
- [x] `engine/pattern.ts` : types + `createPattern`/`toggleStep`/`setStepVelocity`/`setStepPitch`/`resizePattern`/`clearTrack` + tests des invariants (SPECS §2)
- [x] Store Zustand : pattern, bpm, état de lecture
- [x] `AudioEngine` : init après geste utilisateur (`Tone.start()`), Transport play/stop à 150 BPM, `scheduleRepeat('16n')` branché sur le store, click de vérification
- [x] Teardown global dev (HMR Vite : `dispose()` de tout au rechargement)
- [x] Bouton play/stop + BPM affiché, raccourci `espace`
- [x] Commit + review

## Phase 2 — Grille mélodique

- [x] `engine/scales.ts` : mineure naturelle/harmonique, `degreeToMidi`, plages d'octaves + tests
- [x] UI grille DOM/React, cellules mémoïsées ; piste mélodique (lignes = degrés sur 2–3 octaves, snap gamme par construction)
- [x] Toggle on/off par cellule + édition de vélocité
- [x] Lead supersaw (`PolySynth` fatsawtooth, count/spread élevés), interface commune `trigger(step, time)`
- [x] Playhead : overlay positionné piloté par `Tone.Draw` (zéro re-render de cellules)
- [x] Sélecteur de gamme (tonique + mode), longueur de pattern 16/32/48/64
- [x] Édition pendant la lecture prise en compte au pas suivant
- [x] Commit + review

## Phase 3 — Kicks & percus

- [x] Réconciliation moteur ↔ pattern : (re)créer/`dispose()` les instruments quand les pistes ou `instrumentId` changent (`setPattern` des générateurs/presets — la map est figée à l'init en phase 2)
- [x] Piste kick : lane de déclenchement + piano-roll de pitch (snap gamme) + toggle « suivre la mélodie » (`followTrackId`)
- [x] Expressivité kick par pas : durée/gate (rolls), pitch bend (demi-tons), variante A/B/C (presets synthé / slots sampler)
- [x] Kick sampler : import drag & drop / fichier, repitch par `playbackRate` (natif = tonique)
- [x] Kick sampler : 3 slots A/B/C (variante par pas)
- [ ] Kick sampler — stretch : persistance IndexedDB
- [x] Kick synthétisé basique : osc + enveloppe de pitch rapide → `WaveShaper` hard clip + `Chebyshev` → EQ ; params punch / pitch de tail / drive / longueur
- [x] Pistes perc : clap (2 & 4), hats, ride offbeat — `NoiseSynth` filtré / ride synthétique
- [x] Mixage par piste : volume, mute/solo, send FX ; sends delay synchronisé + reverb
- [x] Gain staging par piste + `EQ3` + `Limiter` sur le master (obligatoire dès cette phase)
- [ ] Commit + review

## Phase 4 — Générateurs *(= MVP)*

- [x] `engine/prng.ts` : mulberry32 + dérivation de flux (seed + compteur d'actions) + tests
- [x] `engine/markov.ts` : matrices euphorique/dark/erratique, modes remplacer/compléter + tests (SPECS §3.2)
- [x] `engine/bassline.ts` : mélodie → pitchs de kicks (fondamentales/quintes par mesure) + tests
- [x] `engine/euclid.ts` : Bjorklund + tests
- [x] `engine/mutate.ts` : perturbation contrôlée + tests (densité bornée, gamme respectée)
- [x] Seed global affiché/saisissable ; invariant de reproductibilité testé (même seed + mêmes actions = même pattern)
- [x] Boutons UI : Générer mélodie, Bassline → kicks, Euclide percus, Mutate ; raccourcis `G`/`M`/`R`
- [x] Vérif Definition of done du MVP (brief) + commit + review

## Phase 5 — Sound design & polish

- [x] Chaînes de distorsion par piste (indispensable au genre)
- [x] Screech : FM ou saw détuné + grosse distorsion + pitch bend court (version basique acceptable)
- [x] Ducking lead/screech contre le kick (enveloppe de gain simple, optionnel)
- [x] Durées de notes (drag) sur la piste mélodique
- [x] Sélection/copie de pas (copie de mesure, toutes pistes)
- [x] Commit + review

## Phase 6 — Export & kits

- [ ] Export MVP : `Tone.Recorder` master (webm/opus)
- [ ] Export cible : `Tone.Offline` → WAV déterministe, boucles 4/8/16 mesures calées sur la barre, nom de fichier auto (SPECS §5)
- [ ] Presets JSON : localStorage + export/import fichier, champ `version`
- [ ] Raccourci `E` export
- [ ] Kit « Kosmische / Berlin School » : tempo/gammes/rack dédiés, automate cellulaire comme générateur (si l'envie est là)
- [ ] Déploiement : Dockerfile nginx, service Traefik `awen.breizh.dev` dans `docker-compose.prod.yml`, entrée dans la matrice de `.github/workflows/deploy.yml`, DNS
- [ ] Commit + review

## Definition of done (MVP = fin de phase 4)

- Mélodie euphorique de 4 mesures à 150 BPM, kicks pitchés qui suivent la bassline,
  clap et ride — ça sonne hardstyle, sans glitch.
- Import d'un kick perso : il remplace le kick synthé et se repitch correctement.
- « Générer » + un seed donné produit toujours le même pattern ; « Mutate » le fait
  évoluer sans le détruire.
- `npm test` vert sur `engine/`.
