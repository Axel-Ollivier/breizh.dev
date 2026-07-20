import { setStepPitch, type Pattern, type Track } from './pattern';

export interface BasslineParams {
  /** Alterne fondamentale (temps forts) / quinte (autres pas). */
  useFifths: boolean;
}

/** Classe de degré (0..6) d'un index de degré signé. */
const degreeClass = (degree: number): number => ((degree % 7) + 7) % 7;

/** Ramène une classe de degré dans le registre bas du kick (autour de la tonique). */
const toBassRegister = (cls: number, range: { min: number; max: number }): number => {
  const candidate = cls > 3 ? cls - 7 : cls;
  return Math.min(range.max, Math.max(range.min, candidate));
};

function measureRoot(melody: Track, measureStart: number, lengthSteps: number): number | null {
  const weights = new Map<number, number>();
  for (let i = measureStart; i < Math.min(measureStart + 16, lengthSteps); i++) {
    const step = melody.steps[i];
    if (!step?.on || step.pitch === undefined) continue;
    const cls = degreeClass(step.pitch);
    // Poids = occurrences × vélocité, temps forts doublés (SPECS §3.3).
    const weight = (step.vel ?? 0.8) * (i % 4 === 0 ? 2 : 1);
    weights.set(cls, (weights.get(cls) ?? 0) + weight);
  }
  let best: number | null = null;
  let bestWeight = -1;
  for (const [cls, weight] of weights) {
    if (weight > bestWeight) {
      best = cls;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Bassline → kicks (SPECS §3.3) : par mesure, extrait la fondamentale de la
 * mélodie et écrit les pitchs des pas de kick DÉJÀ actifs (le rythme du kick
 * appartient à l'utilisateur ou à Mutate). Mélodie vide ⟹ pattern inchangé.
 * Pur et déterministe (pas de rng).
 */
export function deriveKickPitches(
  pattern: Pattern,
  kickTrackId: string,
  melodyTrackId: string,
  params: BasslineParams,
): Pattern {
  const kick = pattern.tracks.find((t) => t.id === kickTrackId);
  const melody = pattern.tracks.find((t) => t.id === melodyTrackId);
  if (!kick || kick.kind !== 'kick') throw new Error(`Piste kick attendue : ${kickTrackId}`);
  if (!melody || melody.kind !== 'melodic') {
    throw new Error(`Piste mélodique attendue : ${melodyTrackId}`);
  }
  const range = kick.pitchRange ?? { min: -7, max: 7 };

  let next = pattern;
  let wroteAnything = false;
  for (let measureStart = 0; measureStart < pattern.lengthSteps; measureStart += 16) {
    const root = measureRoot(melody, measureStart, pattern.lengthSteps);
    if (root === null) continue; // mesure sans mélodie : pitchs existants conservés
    for (let i = measureStart; i < Math.min(measureStart + 16, pattern.lengthSteps); i++) {
      if (kick.steps[i]?.on !== true) continue;
      const useFifth = params.useFifths && i % 4 !== 0;
      const cls = useFifth ? degreeClass(root + 4) : root;
      next = setStepPitch(next, kickTrackId, i, toBassRegister(cls, range));
      wroteAnything = true;
    }
  }
  return wroteAnything ? next : pattern;
}
