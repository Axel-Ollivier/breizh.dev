import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/** Lead supersaw hardstyle : fatsawtooth, count/spread élevés. */
export class SupersawLead implements Instrument {
  private readonly synth: Tone.PolySynth<Tone.Synth>;

  constructor(destination: Tone.ToneAudioNode) {
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 7, spread: 55 },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.5, release: 0.08 },
      volume: -14,
    }).connect(destination);
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
  }
}
