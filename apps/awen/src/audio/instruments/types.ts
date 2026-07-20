/**
 * Interface commune du rack (CLAUDE.md règle d'or 7) : ajouter un son au rack
 * = implémenter cette interface, sans toucher au moteur.
 */
export interface ResolvedStep {
  /** Pitch résolu en note MIDI (degré -> gamme déjà appliqué par le moteur). */
  midi: number;
  /** Vélocité effective [0, 1] (défaut déjà appliqué). */
  velocity: number;
}

export interface Instrument {
  /** Déclenche le son au `time` du Transport — jamais l'horloge JS. */
  trigger(step: ResolvedStep, time: number): void;
  /** Libère tous les nodes Tone (HMR, remplacement d'instrument). */
  dispose(): void;
}
