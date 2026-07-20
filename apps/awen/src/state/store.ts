import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { clamp, createPattern, type Pattern } from '../engine/pattern';

export const BPM_MIN = 140;
export const BPM_MAX = 200;
export const DEFAULT_BPM = 150;

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
  isPlaying: boolean;
  setPattern: (pattern: Pattern) => void;
  /** Ignore les valeurs non finies (input number vidé → NaN). */
  setBpm: (bpm: number) => void;
  setPlaying: (isPlaying: boolean) => void;
}

export const useAwenStore = create<AwenState>()(
  subscribeWithSelector((set) => ({
    pattern: defaultPattern(),
    bpm: DEFAULT_BPM,
    isPlaying: false,
    setPattern: (pattern) => set({ pattern }),
    setBpm: (bpm) => {
      if (!Number.isFinite(bpm)) return;
      set({ bpm: clamp(Math.round(bpm), BPM_MIN, BPM_MAX) });
    },
    setPlaying: (isPlaying) => set({ isPlaying }),
  })),
);
