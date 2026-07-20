/**
 * Interface commune du rack (CLAUDE.md règle d'or 7) : ajouter un son au rack
 * = implémenter cette interface, sans toucher au moteur.
 */
export interface ResolvedStep {
  /** Pitch résolu en note MIDI (degré -> gamme déjà appliqué par le moteur). */
  midi: number;
  /** Vélocité effective [0, 1] (défaut déjà appliqué). */
  velocity: number;
  /** Durée imposée en secondes (kicks courts / rolls) ; absente = durée naturelle. */
  durationSec?: number;
  /** Pitch bend court en demi-tons : départ à midi+bend, glissé vers midi. */
  bendSemitones?: number;
  /** Variante d'instrument (0..2) ; absente = 0. */
  variant?: number;
}

export interface Instrument {
  /** Déclenche le son au `time` du Transport — jamais l'horloge JS. */
  trigger(step: ResolvedStep, time: number): void;
  /** Libère tous les nodes Tone (HMR, remplacement d'instrument). */
  dispose(): void;
}
