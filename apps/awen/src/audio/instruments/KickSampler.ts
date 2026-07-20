import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

export const KICK_SLOTS = 3;

/**
 * Sampler de kick : 3 slots (variante du pas = slot A/B/C, repli sur A),
 * repitch par playbackRate (la durée varie avec le pitch — assumé pour des
 * kicks, cf. CLAUDE.md). Le sample joue à sa hauteur native sur la tonique
 * (`rootMidi`, mis à jour par le moteur quand la gamme change) ; chaque
 * trigger est une source one-shot jetable, donc un retrigger rapide superpose
 * proprement. Gate : stop anticipé avec un court fade. Bend : rampe de
 * playbackRate du départ décalé vers la note.
 */
export class KickSampler implements Instrument {
  private readonly output: Tone.Gain;
  private readonly buffers: Array<Tone.ToneAudioBuffer | null>;
  /** Note MIDI jouée au playbackRate 1 (tonique de la gamme courante). */
  rootMidi: number;

  constructor(
    destination: Tone.ToneAudioNode,
    buffers: Array<Tone.ToneAudioBuffer | null>,
    rootMidi: number,
  ) {
    this.output = new Tone.Gain(1).connect(destination);
    this.buffers = buffers;
    this.rootMidi = rootMidi;
  }

  setBuffer(slot: number, buffer: Tone.ToneAudioBuffer): void {
    this.buffers[slot] = buffer;
  }

  trigger(step: ResolvedStep, time: number): void {
    // Slot demandé, sinon premier slot chargé (un seul sample en B ne doit
    // pas rendre les pas en variante A muets).
    const buffer = this.buffers[step.variant ?? 0] ?? this.buffers.find(Boolean) ?? null;
    if (!buffer?.loaded) return;
    const rate = Math.pow(2, (step.midi - this.rootMidi) / 12);
    const gain = new Tone.Gain(step.velocity).connect(this.output);
    const source = new Tone.ToneBufferSource({
      url: buffer,
      playbackRate: rate,
      fadeOut: 0.008,
      onended: () => {
        source.dispose();
        gain.dispose();
      },
    }).connect(gain);

    if (step.bendSemitones) {
      const startRate = rate * Math.pow(2, step.bendSemitones / 12);
      const bendSec = Math.min(0.1, (step.durationSec ?? 0.3) * 0.8);
      source.playbackRate.setValueAtTime(startRate, time);
      source.playbackRate.exponentialRampToValueAtTime(rate, time + bendSec);
    }

    source.start(time);
    if (step.durationSec !== undefined) source.stop(time + step.durationSec);
  }

  dispose(): void {
    // Les buffers appartiennent au moteur (partagés entre remplacements).
    this.output.dispose();
  }
}
