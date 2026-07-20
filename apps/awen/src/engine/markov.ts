import { clearTrack, toggleStep, setStepVelocity, type Pattern } from './pattern';
import { weightedPick, type Rng } from './prng';

export type MelodyCharacter = 'euphorique' | 'dark' | 'erratique';

export type WriteMode = 'replace' | 'complete';

export interface MelodyParams {
  character: MelodyCharacter;
  writeMode: WriteMode;
}

interface CharacterDef {
  /** Matrice 7x7 : ligne = degré courant (classe 0..6), colonne = degré suivant. */
  matrix: readonly (readonly number[])[];
  /** Poids d'activation par position dans le temps (double-croches 0..3). */
  rhythm: readonly [number, number, number, number];
  /** Degrés de départ privilégiés (classes). */
  starts: readonly number[];
  /** Probabilité de saut d'octave à chaque note. */
  octaveJump: number;
}

const CHARACTERS: Record<MelodyCharacter, CharacterDef> = {
  // Mouvements conjoints et tierces, résolutions sur 1/3/5, droit dans le temps.
  euphorique: {
    matrix: [
      [2, 3, 2, 1, 3, 1, 1],
      [3, 1, 3, 1, 2, 1, 1],
      [2, 3, 2, 3, 2, 1, 1],
      [1, 1, 3, 1, 3, 1, 2],
      [3, 1, 2, 3, 2, 2, 1],
      [1, 1, 1, 2, 3, 1, 2],
      [3, 1, 1, 1, 2, 2, 1],
    ],
    rhythm: [0.95, 0.1, 0.55, 0.25],
    starts: [0, 2, 4],
    octaveJump: 0.12,
  },
  // Rôde autour de la tonique et de la sensible, descentes, plus clairsemé.
  dark: {
    matrix: [
      [3, 1, 2, 1, 1, 2, 2],
      [3, 2, 1, 1, 1, 2, 1],
      [2, 2, 2, 1, 1, 2, 1],
      [1, 1, 2, 1, 1, 2, 2],
      [2, 1, 1, 2, 1, 2, 2],
      [2, 1, 2, 1, 1, 2, 2],
      [3, 1, 1, 1, 1, 2, 2],
    ],
    rhythm: [0.75, 0.05, 0.35, 0.35],
    starts: [0, 5, 6],
    octaveJump: 0.08,
  },
  // Poids quasi plats, sauts larges, rythme imprévisible.
  erratique: {
    matrix: [
      [1, 2, 2, 2, 2, 2, 2],
      [2, 1, 2, 2, 2, 2, 2],
      [2, 2, 1, 2, 2, 2, 2],
      [2, 2, 2, 1, 2, 2, 2],
      [2, 2, 2, 2, 1, 2, 2],
      [2, 2, 2, 2, 2, 1, 2],
      [2, 2, 2, 2, 2, 2, 1],
    ],
    rhythm: [0.55, 0.4, 0.5, 0.45],
    starts: [0, 1, 2, 3, 4, 5, 6],
    octaveJump: 0.3,
  },
};

const clampDegree = (degree: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, degree));

/**
 * Mélodie markovienne d'ordre 1 sur les degrés (SPECS §3.2). Pure et seedée :
 * même rng ⟹ même sortie. `replace` vide la piste d'abord, `complete`
 * n'écrit que sur les pas éteints. Seule la piste cible est modifiée.
 */
export function generateMelody(
  pattern: Pattern,
  trackId: string,
  params: MelodyParams,
  rng: Rng,
): Pattern {
  const track = pattern.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Piste inconnue : ${trackId}`);
  if (track.kind !== 'melodic') {
    throw new Error(`generateMelody: piste mélodique attendue (${trackId})`);
  }
  const range = track.pitchRange ?? { min: 0, max: 20 };
  const def = CHARACTERS[params.character];

  let next = params.writeMode === 'replace' ? clearTrack(pattern, trackId) : pattern;
  const written = next.tracks.find((t) => t.id === trackId)!;

  // Octave médiane du registre comme point d'ancrage.
  const midOctave = Math.floor((range.min + range.max) / 2 / 7);
  let degreeClass = def.starts[Math.floor(rng() * def.starts.length)] ?? 0;
  let octave = midOctave;

  for (let i = 0; i < next.lengthSteps; i++) {
    const occupied = written.steps[i]?.on === true;
    const p = def.rhythm[(i % 4) as 0 | 1 | 2 | 3];
    const wantNote = rng() < p;
    // Le tirage rythmique est consommé même sur un pas occupé : la sortie sur
    // les pas libres ne dépend pas du contenu existant (flux stable).
    if (!wantNote || occupied) continue;

    const row = def.matrix[degreeClass] ?? def.matrix[0]!;
    degreeClass = weightedPick(rng, row);
    if (rng() < def.octaveJump) {
      octave += rng() < 0.5 ? -1 : 1;
    }
    // Rappel doux vers le registre médian.
    octave = Math.min(midOctave + 1, Math.max(midOctave - 1, octave));

    const degree = clampDegree(octave * 7 + degreeClass, range.min, range.max);
    next = toggleStep(next, trackId, i, degree);
    // Accents : temps forts plus véloces.
    const vel = i % 16 === 0 ? 1 : i % 4 === 0 ? 0.9 : 0.75;
    next = setStepVelocity(next, trackId, i, vel);
  }

  return next;
}
