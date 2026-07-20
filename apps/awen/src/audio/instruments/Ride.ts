import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/** Ride synthétique : MetalSynth passe-haut, décroissance moyenne. */
export class Ride implements Instrument {
  private readonly metal: Tone.MetalSynth;
  private readonly filter: Tone.Filter;

  constructor(destination: Tone.ToneAudioNode) {
    this.filter = new Tone.Filter({ type: 'highpass', frequency: 5000 }).connect(destination);
    this.metal = new Tone.MetalSynth({
      harmonicity: 5.1,
      modulationIndex: 24,
      resonance: 4000,
      octaves: 1.2,
      envelope: { attack: 0.001, decay: 0.5, release: 0.1 },
      volume: -20,
    }).connect(this.filter);
  }

  trigger(step: ResolvedStep, time: number): void {
    this.metal.triggerAttackRelease(320, 0.4, time, step.velocity);
  }

  dispose(): void {
    this.metal.dispose();
    this.filter.dispose();
  }
}
