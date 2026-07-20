import { clearTrack, setStepVelocity, toggleStep, type Pattern } from './pattern';
import type { Rng } from './prng';

export interface AutomatonParams {
  /** Règle élémentaire de Wolfram (0-255). 90 et 110 sonnent bien. */
  rule: number;
}

/**
 * Automate cellulaire élémentaire comme générateur de séquences (esprit
 * Kosmische / Berlin School) : les cellules vivent sur l'axe des degrés, une
 * génération par croche ; la note jouée est la cellule vivante la plus proche
 * du centre du registre. Pur et seedé (la ligne initiale vient du rng).
 */
export function generateAutomaton(
  pattern: Pattern,
  trackId: string,
  params: AutomatonParams,
  rng: Rng,
): Pattern {
  if (!Number.isInteger(params.rule) || params.rule < 0 || params.rule > 255) {
    throw new Error(`Règle hors [0, 255] : ${params.rule}`);
  }
  const track = pattern.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Piste inconnue : ${trackId}`);
  if (track.kind !== 'melodic') {
    throw new Error(`generateAutomaton: piste mélodique attendue (${trackId})`);
  }
  const range = track.pitchRange ?? { min: 0, max: 20 };
  const width = range.max - range.min + 1;
  const center = Math.floor(width / 2);

  // Ligne initiale clairsemée, jamais vide.
  let cells = Array.from({ length: width }, () => rng() < 0.28);
  if (!cells.some(Boolean)) cells[center] = true;

  let next = clearTrack(pattern, trackId);
  for (let i = 0; i < next.lengthSteps; i++) {
    // Une génération par croche : notes sur les pas pairs, évolution entre.
    if (i % 2 === 0) {
      let bestIndex = -1;
      let bestDistance = Infinity;
      cells.forEach((alive, index) => {
        const distance = Math.abs(index - center);
        if (alive && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      if (bestIndex >= 0) {
        next = toggleStep(next, trackId, i, range.min + bestIndex);
        next = setStepVelocity(next, trackId, i, i % 16 === 0 ? 0.8 : 0.6);
      }
    } else {
      cells = cells.map((_, index) => {
        const left = cells[(index - 1 + width) % width] ? 4 : 0;
        const self = cells[index] ? 2 : 0;
        const right = cells[(index + 1) % width] ? 1 : 0;
        return (params.rule >> (left + self + right)) % 2 === 1;
      });
      // Un automate mort se réensemence (rule 0/éteinte) pour rester musical.
      if (!cells.some(Boolean)) cells[center] = true;
    }
  }
  return next;
}
