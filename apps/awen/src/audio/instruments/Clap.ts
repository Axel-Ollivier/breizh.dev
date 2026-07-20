import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/** Clap : bruit filtré en bande, enveloppe sèche. */
export class Clap implements Instrument {
  private readonly noise: Tone.NoiseSynth;
  private readonly filter: Tone.Filter;

  constructor(destination: Tone.ToneAudioNode) {
    this.filter = new Tone.Filter({ type: 'bandpass', frequency: 1300, Q: 1.2 }).connect(
      destination,
    );
    this.noise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.002, decay: 0.18, sustain: 0 },
      volume: -8,
    }).connect(this.filter);
  }

  trigger(step: ResolvedStep, time: number): void {
    this.noise.triggerAttackRelease(0.18, time, step.velocity);
  }

  dispose(): void {
    this.noise.dispose();
    this.filter.dispose();
  }
}
