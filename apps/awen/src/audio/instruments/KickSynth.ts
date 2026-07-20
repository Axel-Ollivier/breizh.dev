import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/**
 * Kick synthétisé « piep/raw » : membrane (enveloppe de pitch rapide = punch)
 * → hard clip (WaveShaper) → Chebyshev → EQ. Un zaag convaincant en pure
 * synthèse est hors scope (CLAUDE.md) — le sampler reste la voie pro.
 */
export class KickSynth implements Instrument {
  private readonly membrane: Tone.MembraneSynth;
  private readonly clip: Tone.WaveShaper;
  private readonly cheby: Tone.Chebyshev;
  private readonly eq: Tone.EQ3;

  constructor(destination: Tone.ToneAudioNode) {
    this.eq = new Tone.EQ3({ low: 2, mid: -1, high: -3 }).connect(destination);
    this.cheby = new Tone.Chebyshev({ order: 3, wet: 0.2 }).connect(this.eq);
    // Hard clip symétrique, drive x2.5 — le niveau est rattrapé par l'EQ/limiter.
    this.clip = new Tone.WaveShaper((x) => Math.max(-1, Math.min(1, x * 2.5)), 1024).connect(
      this.cheby,
    );
    this.membrane = new Tone.MembraneSynth({
      pitchDecay: 0.025,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.04 },
      volume: -6,
    }).connect(this.clip);
  }

  trigger(step: ResolvedStep, time: number): void {
    // La note pilote le pitch de tail ; une octave sous la bassline pour
    // rester dans le registre kick.
    const freq = Tone.Frequency(step.midi, 'midi').toFrequency() / 2;
    this.membrane.triggerAttackRelease(freq, 0.3, time, step.velocity);
  }

  dispose(): void {
    this.membrane.dispose();
    this.clip.dispose();
    this.cheby.dispose();
    this.eq.dispose();
  }
}
