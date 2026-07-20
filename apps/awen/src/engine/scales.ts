// Gammes et conversion degré -> note MIDI — logique pure (SPECS §1.2).
// `Step.pitch` est un index de degré ; la conversion en MIDI n'arrive qu'ici,
// au moment du trigger (audio) ou de l'affichage (labels de lignes).

export type ScaleMode = 'minorNatural' | 'minorHarmonic';

export interface Scale {
  /** Note MIDI de la tonique à l'octave de référence (degré 0). */
  rootMidi: number;
  mode: ScaleMode;
}

export const SCALE_MODES: readonly ScaleMode[] = ['minorNatural', 'minorHarmonic'];

export const SCALE_MODE_LABELS: Record<ScaleMode, string> = {
  minorNatural: 'mineure naturelle',
  minorHarmonic: 'mineure harmonique',
};

/** Intervalles en demi-tons depuis la tonique, 7 degrés par octave. */
const INTERVALS: Record<ScaleMode, readonly number[]> = {
  minorNatural: [0, 2, 3, 5, 7, 8, 10],
  minorHarmonic: [0, 2, 3, 5, 7, 8, 11],
};

export const DEGREES_PER_OCTAVE = 7;

/**
 * Degré (entier, négatif autorisé) -> note MIDI. Le degré 7 est la tonique une
 * octave au-dessus du degré 0, -7 une octave en dessous.
 */
export function degreeToMidi(scale: Scale, degree: number): number {
  if (!Number.isInteger(degree)) {
    throw new Error(`Degré non entier : ${degree}`);
  }
  const octave = Math.floor(degree / DEGREES_PER_OCTAVE);
  const index = degree - octave * DEGREES_PER_OCTAVE;
  const interval = INTERVALS[scale.mode][index];
  if (interval === undefined) {
    throw new Error(`Degré hors gamme : ${degree}`);
  }
  return scale.rootMidi + octave * 12 + interval;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Note MIDI -> nom (ex. 53 -> "F3"), octave selon la convention C4 = 60. */
export function midiToNoteName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** Label d'une ligne de la grille (ex. degré 0 en Fa mineur -> "F3"). */
export function degreeLabel(scale: Scale, degree: number): string {
  return midiToNoteName(degreeToMidi(scale, degree));
}

/** Tonalités proposées dans l'UI : F mineur par défaut (hardstyle classique). */
export const DEFAULT_SCALE: Scale = { rootMidi: 53, mode: 'minorNatural' }; // F3
