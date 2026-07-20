import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/** Hi-hat fermé : bruit blanc passe-haut, très court. */
export class Hats implements Instrument {
  private readonly noise: Tone.NoiseSynth;
  private readonly filter: Tone.Filter;

  constructor(destination: Tone.ToneAudioNode) {
    this.filter = new Tone.Filter({ type: 'highpass', frequency: 8000 }).connect(destination);
    this.noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
      volume: -14,
    }).connect(this.filter);
  }

  trigger(step: ResolvedStep, time: number): void {
    this.noise.triggerAttackRelease(0.05, time, step.velocity);
  }

  dispose(): void {
    this.noise.dispose();
    this.filter.dispose();
  }
}
