import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/** Pluck : triangle percussif à décroissance rapide. */
export class Pluck implements Instrument {
  private readonly synth: Tone.PolySynth<Tone.Synth>;

  constructor(destination: Tone.ToneAudioNode) {
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.16, sustain: 0.05, release: 0.12 },
      volume: -10,
    }).connect(destination);
  }

  trigger(step: ResolvedStep, time: number): void {
    this.synth.triggerAttackRelease(
      Tone.Frequency(step.midi, 'midi').toFrequency(),
      step.durationSec ?? 0.2,
      time,
      step.velocity,
    );
  }

  dispose(): void {
    this.synth.dispose();
  }
}
