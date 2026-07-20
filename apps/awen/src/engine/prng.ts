// PRNG seedé — SEULE source d'aléa autorisée dans engine/ (jamais Math.random).

/** Générateur [0, 1), déterministe pour une graine donnée. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mélange seed + compteur d'action -> graine de flux (SPECS §3.1) : chaque
 * action génératrice consomme son propre flux, indépendant des précédentes.
 */
export function hashSeed(seed: number, counter: number): number {
  let h = ((seed >>> 0) ^ Math.imul(counter + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function streamRng(seed: number, counter: number): Rng {
  return mulberry32(hashSeed(seed, counter));
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  const value = values[Math.floor(rng() * values.length)];
  if (value === undefined) throw new Error('pick: tableau vide');
  return value;
}

/** Tirage pondéré ; les poids ≤ 0 sont ignorés. */
export function weightedPick(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) if (w > 0) total += w;
  if (total <= 0) throw new Error('weightedPick: aucun poids positif');
  let target = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0) continue;
    target -= w;
    if (target < 0) return i;
  }
  return weights.length - 1;
}
