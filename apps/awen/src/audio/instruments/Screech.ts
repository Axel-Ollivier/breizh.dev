import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/**
 * Screech rawstyle (version basique assumée, cf. brief) : FM saw fortement
 * modulée → grosse distorsion → passe-bande. Pitch bend court à l'attaque
 * (départ +2 demi-tons, glissé vers la note).
 */
export class Screech implements Instrument {
  private readonly synth: Tone.FMSynth;
  private readonly distortion: Tone.Distortion;
  private readonly filter: Tone.Filter;

  constructor(destination: Tone.ToneAudioNode) {
    this.filter = new Tone.Filter({ type: 'bandpass', frequency: 1600, Q: 1.1 }).connect(
      destination,
    );
    this.distortion = new Tone.Distortion({ distortion: 0.9, oversample: '2x' }).connect(
      this.filter,
    );
    this.synth = new Tone.FMSynth({
      harmonicity: 2.02,
      modulationIndex: 18,
      oscillator: { type: 'sawtooth' },
      modulation: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.05 },
      modulationEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.05 },
      volume: -16,
    }).connect(this.distortion);
  }

  trigger(step: ResolvedStep, time: number): void {
    const duration = step.durationSec ?? 0.12;
    this.synth.detune.cancelScheduledValues(time);
    this.synth.detune.setValueAtTime(200, time);
    this.synth.detune.linearRampToValueAtTime(0, time + Math.min(0.06, duration * 0.5));
    this.synth.triggerAttackRelease(
      Tone.Frequency(step.midi, 'midi').toFrequency(),
      duration,
      time,
      step.velocity,
    );
  }

  dispose(): void {
    this.synth.dispose();
    this.distortion.dispose();
    this.filter.dispose();
  }
}
