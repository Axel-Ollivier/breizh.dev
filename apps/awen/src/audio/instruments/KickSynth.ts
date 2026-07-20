import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/** Presets des variantes de kick (A punch, B tight/roll, C boom). */
const VARIANTS = [
  { pitchDecay: 0.025, octaves: 6, decay: 0.32 },
  { pitchDecay: 0.012, octaves: 4, decay: 0.14 },
  { pitchDecay: 0.05, octaves: 7, decay: 0.5 },
] as const;

/**
 * Kick synthétisé « piep/raw » : membrane (enveloppe de pitch rapide = punch)
 * → hard clip (WaveShaper) → Chebyshev → EQ. Un zaag convaincant en pure
 * synthèse est hors scope (CLAUDE.md) — le sampler reste la voie pro.
 *
 * Expressivité par pas : variante (preset), durée (rolls), bend (glissé de
 * détune court vers la note, indépendant de l'enveloppe de pitch interne).
 */
export class KickSynth implements Instrument {
  private readonly membrane: Tone.MembraneSynth;
  private readonly clip: Tone.WaveShaper;
  private readonly cheby: Tone.Chebyshev;
  private readonly eq: Tone.EQ3;
  private currentVariant = 0;

  constructor(destination: Tone.ToneAudioNode) {
    this.eq = new Tone.EQ3({ low: 2, mid: -1, high: -3 }).connect(destination);
    this.cheby = new Tone.Chebyshev({ order: 3, wet: 0.2 }).connect(this.eq);
    // Hard clip symétrique, drive x2.5 — le niveau est rattrapé par l'EQ/limiter.
    this.clip = new Tone.WaveShaper((x) => Math.max(-1, Math.min(1, x * 2.5)), 1024).connect(
      this.cheby,
    );
    this.membrane = new Tone.MembraneSynth({
      pitchDecay: VARIANTS[0].pitchDecay,
      octaves: VARIANTS[0].octaves,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: VARIANTS[0].decay, sustain: 0, release: 0.04 },
      volume: -6,
    }).connect(this.clip);
  }

  trigger(step: ResolvedStep, time: number): void {
    const variant = VARIANTS[step.variant ?? 0] ?? VARIANTS[0];
    if ((step.variant ?? 0) !== this.currentVariant) {
      this.membrane.set({
        pitchDecay: variant.pitchDecay,
        octaves: variant.octaves,
        envelope: { decay: variant.decay },
      });
      this.currentVariant = step.variant ?? 0;
    }

    // La note pilote le pitch de tail ; une octave sous la bassline pour
    // rester dans le registre kick.
    const freq = Tone.Frequency(step.midi, 'midi').toFrequency() / 2;
    const duration = step.durationSec !== undefined
      ? Math.min(step.durationSec, variant.decay)
      : variant.decay;

    // Bend : glissé de détune vers 0, découplé de l'enveloppe de pitch interne.
    this.membrane.detune.cancelScheduledValues(time);
    if (step.bendSemitones) {
      this.membrane.detune.setValueAtTime(step.bendSemitones * 100, time);
      this.membrane.detune.linearRampToValueAtTime(0, time + Math.min(0.1, duration * 0.8));
    } else {
      this.membrane.detune.setValueAtTime(0, time);
    }

    this.membrane.triggerAttackRelease(freq, duration, time, step.velocity);
  }

  dispose(): void {
    this.membrane.dispose();
    this.clip.dispose();
    this.cheby.dispose();
    this.eq.dispose();
  }
}
