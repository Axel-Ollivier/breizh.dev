import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/** Lead carré : PolySynth square + passe-bas résonant. */
export class SquareLead implements Instrument {
  private readonly synth: Tone.PolySynth<Tone.Synth>;
  private readonly filter: Tone.Filter;

  constructor(destination: Tone.ToneAudioNode) {
    this.filter = new Tone.Filter({ type: 'lowpass', frequency: 2200, Q: 2 }).connect(destination);
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square' },
      envelope: { attack: 0.004, decay: 0.12, sustain: 0.4, release: 0.06 },
      volume: -14,
    }).connect(this.filter);
  }

  trigger(step: ResolvedStep, time: number): void {
    this.synth.triggerAttackRelease(
      Tone.Frequency(step.midi, 'midi').toFrequency(),
      step.durationSec ?? '16n',
      time,
      step.velocity,
    );
  }

  dispose(): void {
    this.synth.dispose();
    this.filter.dispose();
  }
}
