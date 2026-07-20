import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  clamp,
  clearStepPitch,
  copyMeasure,
  createPattern,
  DEFAULT_VELOCITY,
  GATE_LEVELS,
  KICK_VARIANTS,
  resizePattern,
  setStepBend,
  setStepGate,
  setStepLen,
  setStepPitch,
  setStepVariant,
  setStepVelocity,
  setTrackDrive,
  setTrackFollow,
  setTrackInstrument,
  setTrackMute,
  setTrackSend,
  setTrackSolo,
  setTrackVolume,
  toggleStep,
  type Pattern,
  type PatternLength,
} from '../engine/pattern';
import { generateAutomaton } from '../engine/automaton';
import { deriveKickPitches } from '../engine/bassline';
import { euclidToTrack } from '../engine/euclid';
import { generateMelody, type MelodyCharacter, type WriteMode } from '../engine/markov';
import { mutatePattern } from '../engine/mutate';
import { hashSeed, streamRng } from '../engine/prng';
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
    { id: 'kick', kind: 'kick', instrumentId: 'kick-synth', pitchRange: { min: -7, max: 7 } },
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
  /** Toggle simple d'un pas kick/perc (lane de déclenchement). */
  toggleLaneStep: (trackId: string, stepIndex: number) => void;
  /**
   * Clic sur le piano-roll de pitch du kick : pose la hauteur, la déplace,
   * ou — reclic sur la même — la retire (retour hauteur native) ; sur un pas
   * éteint, allume le kick avec cette hauteur.
   */
  clickKickPitchCell: (trackId: string, stepIndex: number, degree: number) => void;
  /** Alt+clic : cycle la durée du kick (GATE_LEVELS — rolls). */
  cycleStepGate: (trackId: string, stepIndex: number) => void;
  /** Ctrl/Cmd+clic : cycle la variante de kick (A/B/C). */
  cycleStepVariant: (trackId: string, stepIndex: number) => void;
  /** Molette sur un pas kick actif : bend ±1 demi-ton. */
  adjustStepBend: (trackId: string, stepIndex: number, delta: number) => void;
  /** Toggle « suivre la mélodie » d'une piste kick. */
  setKickFollow: (trackId: string, followTrackId: string | undefined) => void;
  setTrackInstrument: (trackId: string, instrumentId: string) => void;
  setTrackDrive: (trackId: string, drive: number) => void;
  /** Durée d'une note mélodique en pas (drag). */
  setStepLength: (trackId: string, stepIndex: number, len: number) => void;
  /** Copie la mesure source vers la cible (toutes pistes). */
  copyMeasureAction: (from: number, to: number) => void;
  /** Ducking des leads contre le kick. */
  ducking: boolean;
  setDucking: (ducking: boolean) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackMute: (trackId: string, mute: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;
  setTrackSend: (trackId: string, sendFx: number) => void;
  /** Noms des samples de kick par slot (les buffers vivent dans le moteur audio). */
  kickSampleNames: Array<string | null>;
  setKickSampleName: (slot: number, name: string | null) => void;

  // Générateurs (SPECS §3) — même seed + mêmes actions = même pattern.
  seed: number;
  /** Compteur d'actions génératrices (flux dérivé par action). */
  actionCounter: number;
  character: MelodyCharacter;
  setSeed: (seed: number) => void;
  /** Nouveau seed dérivé déterministiquement du courant (R). */
  newSeed: () => void;
  setCharacter: (character: MelodyCharacter) => void;
  /** Markov -> piste mélodique (G = replace). */
  generateMelodyAction: (writeMode: WriteMode) => void;
  /** Fondamentales/quintes de la mélodie -> pitchs des kicks actifs. */
  deriveBasslineAction: () => void;
  /** Presets euclidiens : clap 2&4, hats double-croches off, ride croches off. */
  euclidPercsAction: () => void;
  /** Perturbation contrôlée (M). */
  mutateAction: () => void;
  /** Automate cellulaire (règle 90) -> piste mélodique (esprit Kosmische). */
  automatonAction: () => void;
  /** Longueur d'export WAV en mesures. */
  exportBars: 4 | 8 | 16;
  setExportBars: (bars: 4 | 8 | 16) => void;
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
    toggleLaneStep: (trackId, stepIndex) =>
      set({ pattern: toggleStep(get().pattern, trackId, stepIndex) }),
    clickKickPitchCell: (trackId, stepIndex, degree) => {
      const { pattern } = get();
      const step = pattern.tracks.find((t) => t.id === trackId)?.steps[stepIndex];
      if (!step) return;
      if (!step.on) {
        set({ pattern: toggleStep(pattern, trackId, stepIndex, degree) });
      } else if (step.pitch === degree) {
        set({ pattern: clearStepPitch(pattern, trackId, stepIndex) });
      } else {
        set({ pattern: setStepPitch(pattern, trackId, stepIndex, degree) });
      }
    },
    cycleStepGate: (trackId, stepIndex) => {
      const { pattern } = get();
      const step = pattern.tracks.find((t) => t.id === trackId)?.steps[stepIndex];
      if (!step?.on) return;
      const index = GATE_LEVELS.indexOf((step.gate ?? 1) as (typeof GATE_LEVELS)[number]);
      const next = GATE_LEVELS[(index + 1) % GATE_LEVELS.length] ?? 1;
      set({ pattern: setStepGate(pattern, trackId, stepIndex, next) });
    },
    cycleStepVariant: (trackId, stepIndex) => {
      const { pattern } = get();
      const step = pattern.tracks.find((t) => t.id === trackId)?.steps[stepIndex];
      if (!step?.on) return;
      set({
        pattern: setStepVariant(pattern, trackId, stepIndex, ((step.variant ?? 0) + 1) % KICK_VARIANTS),
      });
    },
    adjustStepBend: (trackId, stepIndex, delta) => {
      const { pattern } = get();
      const step = pattern.tracks.find((t) => t.id === trackId)?.steps[stepIndex];
      if (!step?.on) return;
      set({ pattern: setStepBend(pattern, trackId, stepIndex, (step.bend ?? 0) + delta) });
    },
    setKickFollow: (trackId, followTrackId) =>
      set({ pattern: setTrackFollow(get().pattern, trackId, followTrackId) }),
    setTrackInstrument: (trackId, instrumentId) =>
      set({ pattern: setTrackInstrument(get().pattern, trackId, instrumentId) }),
    setTrackDrive: (trackId, drive) => {
      if (!Number.isFinite(drive)) return;
      set({ pattern: setTrackDrive(get().pattern, trackId, drive) });
    },
    setStepLength: (trackId, stepIndex, len) => {
      const step = get().pattern.tracks.find((t) => t.id === trackId)?.steps[stepIndex];
      if (!step?.on) return;
      set({ pattern: setStepLen(get().pattern, trackId, stepIndex, len) });
    },
    copyMeasureAction: (from, to) => set({ pattern: copyMeasure(get().pattern, from, to) }),
    ducking: true,
    setDucking: (ducking) => set({ ducking }),
    setTrackVolume: (trackId, volume) => {
      if (!Number.isFinite(volume)) return;
      set({ pattern: setTrackVolume(get().pattern, trackId, volume) });
    },
    setTrackMute: (trackId, mute) => set({ pattern: setTrackMute(get().pattern, trackId, mute) }),
    setTrackSolo: (trackId, solo) => set({ pattern: setTrackSolo(get().pattern, trackId, solo) }),
    setTrackSend: (trackId, sendFx) => {
      if (!Number.isFinite(sendFx)) return;
      set({ pattern: setTrackSend(get().pattern, trackId, sendFx) });
    },
    kickSampleNames: [null, null, null],
    setKickSampleName: (slot, name) =>
      set({
        kickSampleNames: get().kickSampleNames.map((n, i) => (i === slot ? name : n)),
      }),

    seed: 4242,
    actionCounter: 0,
    character: 'euphorique',
    setSeed: (seed) => {
      if (!Number.isFinite(seed)) return;
      set({ seed: Math.abs(Math.round(seed)) >>> 0, actionCounter: 0 });
    },
    newSeed: () => set({ seed: hashSeed(get().seed, 0x5eed), actionCounter: 0 }),
    setCharacter: (character) => set({ character }),
    generateMelodyAction: (writeMode) => {
      const { pattern, seed, actionCounter, character } = get();
      set({
        pattern: generateMelody(
          pattern,
          'melody',
          { character, writeMode },
          streamRng(seed, actionCounter),
        ),
        actionCounter: actionCounter + 1,
      });
    },
    deriveBasslineAction: () =>
      set({ pattern: deriveKickPitches(get().pattern, 'kick', 'melody', { useFifths: true }) }),
    euclidPercsAction: () => {
      let { pattern } = get();
      pattern = euclidToTrack(pattern, 'clap', 2, 3); // 2 & 4
      pattern = euclidToTrack(pattern, 'hats', 8, 0); // doubles-croches off
      pattern = euclidToTrack(pattern, 'ride', 4, 1); // croches off
      set({ pattern });
    },
    mutateAction: () => {
      const { pattern, seed, actionCounter } = get();
      set({
        pattern: mutatePattern(pattern, { intensity: 0.1 }, streamRng(seed, actionCounter)),
        actionCounter: actionCounter + 1,
      });
    },
    automatonAction: () => {
      const { pattern, seed, actionCounter } = get();
      set({
        pattern: generateAutomaton(pattern, 'melody', { rule: 90 }, streamRng(seed, actionCounter)),
        actionCounter: actionCounter + 1,
      });
    },
    exportBars: 8,
    setExportBars: (exportBars) => set({ exportBars }),
  })),
);
