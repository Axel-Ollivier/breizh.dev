import { setStepPitch, toggleStep, type Pattern, type Track } from './pattern';
import { randInt, weightedPick, type Rng } from './prng';

export interface MutateParams {
  /** Proportion maximale de pas touchés par piste, dans ]0, 0.5]. Défaut 0.1. */
  intensity: number;
  /** Pistes cibles ; absent = toutes. */
  trackIds?: string[];
}

/** move / pitch / add / remove — l'équilibre add/remove borne la dérive de densité. */
const OP_WEIGHTS = [4, 3, 1.5, 1.5] as const;

const activeIndices = (track: Track): number[] =>
  track.steps.flatMap((s, i) => (s.on ? [i] : []));

/**
 * Perturbation contrôlée du pattern (SPECS §3.5) : déplace/ajoute/retire
 * quelques pas, bruite les pitchs dans la gamme (±1/±2 degrés). Une piste
 * vide reste vide (rien ex nihilo). Pur et seedé.
 */
export function mutatePattern(pattern: Pattern, params: MutateParams, rng: Rng): Pattern {
  const intensity = Math.min(0.5, Math.max(0.01, params.intensity));
  let next = pattern;

  for (const track of pattern.tracks) {
    if (params.trackIds && !params.trackIds.includes(track.id)) continue;
    const active = activeIndices(track);
    if (active.length === 0) continue; // jamais de matière ex nihilo
    const budget = Math.max(1, Math.round(active.length * intensity));

    for (let n = 0; n < budget; n++) {
      // Relit l'état courant de la piste (les ops précédentes comptent).
      const current = next.tracks.find((t) => t.id === track.id)!;
      const on = activeIndices(current);
      if (on.length === 0) break;
      const op = weightedPick(rng, OP_WEIGHTS);

      if (op === 0) {
        // move : décale un pas actif de ±1 si la destination est libre
        const from = on[randInt(rng, 0, on.length - 1)]!;
        const dir = rng() < 0.5 ? -1 : 1;
        const to = (from + dir + next.lengthSteps) % next.lengthSteps;
        const target = current.steps[to];
        const source = current.steps[from]!;
        if (target && !target.on) {
          next = toggleStep(next, track.id, from);
          next = toggleStep(
            next,
            track.id,
            to,
            current.kind === 'perc' ? undefined : source.pitch,
          );
        }
      } else if (op === 1) {
        // pitch : bruite un pitch dans la gamme (melodic/kick uniquement)
        if (current.kind === 'perc') continue;
        const candidates = on.filter((i) => current.steps[i]?.pitch !== undefined);
        if (candidates.length === 0) continue;
        const i = candidates[randInt(rng, 0, candidates.length - 1)]!;
        const delta = (rng() < 0.7 ? 1 : 2) * (rng() < 0.5 ? -1 : 1);
        next = setStepPitch(next, track.id, i, current.steps[i]!.pitch! + delta);
      } else if (op === 2) {
        // add : allume un pas voisin d'un pas actif (cohérence rythmique)
        const anchor = on[randInt(rng, 0, on.length - 1)]!;
        const to = (anchor + (rng() < 0.5 ? -2 : 2) + next.lengthSteps) % next.lengthSteps;
        const target = current.steps[to];
        if (target && !target.on) {
          const pitch =
            current.kind === 'perc' ? undefined : current.steps[anchor]?.pitch;
          if (current.kind === 'melodic' && pitch === undefined) continue;
          next = toggleStep(next, track.id, to, pitch);
        }
      } else if (on.length > 1) {
        // remove : éteint un pas (jamais le dernier)
        const i = on[randInt(rng, 0, on.length - 1)]!;
        next = toggleStep(next, track.id, i);
      }
    }
  }

  return next;
}
