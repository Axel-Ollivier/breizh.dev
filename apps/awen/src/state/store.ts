import { create } from 'zustand';

import { createPattern, type Pattern } from '../engine/pattern';

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
  setBpm: (bpm: number) => void;
  setPlaying: (isPlaying: boolean) => void;
}

export const useAwenStore = create<AwenState>((set) => ({
  pattern: defaultPattern(),
  bpm: DEFAULT_BPM,
  isPlaying: false,
  setPattern: (pattern) => set({ pattern }),
  setBpm: (bpm) => set({ bpm: Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm))) }),
  setPlaying: (isPlaying) => set({ isPlaying }),
}));
