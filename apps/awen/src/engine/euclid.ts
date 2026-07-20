import { toggleStep, type Pattern } from './pattern';

/**
 * Rythme euclidien (Bjorklund, méthode du seau) : exactement `pulses` pas
 * actifs répartis au plus régulièrement sur `steps`. Déterministe, sans rng.
 * `rotation` décale le motif vers la gauche.
 */
export function bjorklund(pulses: number, steps: number, rotation = 0): boolean[] {
  if (!Number.isInteger(pulses) || !Number.isInteger(steps) || steps <= 0) {
    throw new Error(`bjorklund: arguments invalides (${pulses}, ${steps})`);
  }
  if (pulses < 0 || pulses > steps) {
    throw new Error(`bjorklund: pulses (${pulses}) hors [0, ${steps}]`);
  }
  const pattern: boolean[] = [];
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += pulses;
    if (bucket >= steps) {
      bucket -= steps;
      pattern.push(true);
    } else {
      pattern.push(false);
    }
  }
  const r = ((rotation % steps) + steps) % steps;
  return [...pattern.slice(r), ...pattern.slice(0, r)];
}

/**
 * Applique un motif euclidien d'une mesure (16 pas), tuilé sur toute la
 * longueur du pattern, à une piste (remplace son contenu).
 */
export function euclidToTrack(
  pattern: Pattern,
  trackId: string,
  pulses: number,
  rotation = 0,
): Pattern {
  const measure = bjorklund(pulses, 16, rotation);
  const track = pattern.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Piste inconnue : ${trackId}`);
  if (track.kind === 'melodic') {
    throw new Error(`euclidToTrack: pistes kick/perc uniquement (${trackId})`);
  }
  let next = pattern;
  for (let i = 0; i < pattern.lengthSteps; i++) {
    const want = measure[i % 16] === true;
    const current = track.steps[i]?.on === true;
    if (want !== current) next = toggleStep(next, trackId, i);
  }
  return next;
}
