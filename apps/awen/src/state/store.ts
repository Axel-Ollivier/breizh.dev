import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  clamp,
  createPattern,
  DEFAULT_VELOCITY,
  resizePattern,
  setStepPitch,
  setStepVelocity,
  toggleStep,
  type Pattern,
  type PatternLength,
} from '../engine/pattern';
import { DEFAULT_SCALE, type Scale } from '../engine/scales';

export const BPM_MIN = 140;
export const BPM_MAX = 200;
export const DEFAULT_BPM = 150;

/** Niveaux de vélocité cyclés par shift+clic — le niveau médian EST le défaut. */
export const VELOCITY_LEVELS = [0.4, DEFAULT_VELOCITY, 1] as const;

// Kit Hardstyle : pistes par défaut du MVP.
const defaultPattern = (): Pattern =>
  createPattern(32, [
    { id: 'melody', kind: 'melodic', instrumentId: 'supersaw', pitchRange: { min: 0, max: 20 } },
    { id: 'kick', kind: 'kick', instrumentId: 'kick-synth', pitchRange: { min: -7, max: 13 } },
    { id: 'clap', kind: 'perc', instrumentId: 'clap' },
    { id: 'hats', kind: 'perc', instrumentId: 'hats' },
    { id: 'ride', kind: 'perc', instrumentId: 'ride' },
  ]);

interface AwenState {
  pattern: Pattern;
  bpm: number;
  scale: Scale;
  isPlaying: boolean;
  setPattern: (pattern: Pattern) => void;
  /** Ignore les valeurs non finies (input number vidé → NaN). */
  setBpm: (bpm: number) => void;
  setScale: (scale: Scale) => void;
  /** Redimensionne le pattern (la confirmation de troncature est du ressort de l'UI). */
  setLengthSteps: (length: PatternLength) => void;
  setPlaying: (isPlaying: boolean) => void;
  /**
   * Clic sur la cellule (degré, pas) d'une piste mélodique : pose la note,
   * la déplace si une autre note occupe la colonne, ou l'efface si on
   * reclique la note existante.
   */
  clickMelodicCell: (trackId: string, stepIndex: number, degree: number) => void;
  /** Shift+clic : cycle la vélocité d'un pas actif (VELOCITY_LEVELS). */
  cycleStepVelocity: (trackId: string, stepIndex: number) => void;
}

export const useAwenStore = create<AwenState>()(
  subscribeWithSelector((set, get) => ({
    pattern: defaultPattern(),
    bpm: DEFAULT_BPM,
    scale: DEFAULT_SCALE,
    isPlaying: false,
    setPattern: (pattern) => set({ pattern }),
    setBpm: (bpm) => {
      if (!Number.isFinite(bpm)) return;
      set({ bpm: clamp(Math.round(bpm), BPM_MIN, BPM_MAX) });
    },
    setScale: (scale) => set({ scale }),
    setLengthSteps: (length) => set({ pattern: resizePattern(get().pattern, length) }),
    setPlaying: (isPlaying) => set({ isPlaying }),
    clickMelodicCell: (trackId, stepIndex, degree) => {
      const { pattern } = get();
      const step = pattern.tracks.find((t) => t.id === trackId)?.steps[stepIndex];
      if (!step) return;
      if (step.on && step.pitch === degree) {
        set({ pattern: toggleStep(pattern, trackId, stepIndex) });
      } else if (step.on) {
        set({ pattern: setStepPitch(pattern, trackId, stepIndex, degree) });
      } else {
        set({ pattern: toggleStep(pattern, trackId, stepIndex, degree) });
      }
    },
    cycleStepVelocity: (trackId, stepIndex) => {
      const { pattern } = get();
      const step = pattern.tracks.find((t) => t.id === trackId)?.steps[stepIndex];
      if (!step?.on) return;
      const current = step.vel ?? DEFAULT_VELOCITY;
      const index = VELOCITY_LEVELS.findIndex((v) => Math.abs(v - current) < 1e-6);
      const next = VELOCITY_LEVELS[(index + 1) % VELOCITY_LEVELS.length] ?? VELOCITY_LEVELS[1];
      set({ pattern: setStepVelocity(pattern, trackId, stepIndex, next) });
    },
  })),
);
