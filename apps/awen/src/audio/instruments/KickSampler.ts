import * as Tone from 'tone';

import type { Instrument, ResolvedStep } from './types';

/**
 * Sampler de kick : un slot, repitch par playbackRate (la durée varie avec le
 * pitch — assumé pour des kicks, cf. CLAUDE.md). Le sample joue à sa hauteur
 * native sur la tonique (`rootMidi`, mis à jour par le moteur quand la gamme
 * change) ; chaque trigger est une source one-shot jetable, donc un retrigger
 * rapide superpose proprement.
 */
export class KickSampler implements Instrument {
  private readonly output: Tone.Gain;
  private buffer: Tone.ToneAudioBuffer;
  /** Note MIDI jouée au playbackRate 1 (tonique de la gamme courante). */
  rootMidi: number;

  constructor(destination: Tone.ToneAudioNode, buffer: Tone.ToneAudioBuffer, rootMidi: number) {
    this.output = new Tone.Gain(1).connect(destination);
    this.buffer = buffer;
    this.rootMidi = rootMidi;
  }

  setBuffer(buffer: Tone.ToneAudioBuffer): void {
    this.buffer = buffer;
  }

  trigger(step: ResolvedStep, time: number): void {
    if (!this.buffer.loaded) return;
    const rate = Math.pow(2, (step.midi - this.rootMidi) / 12);
    const gain = new Tone.Gain(step.velocity).connect(this.output);
    const source = new Tone.ToneBufferSource({
      url: this.buffer,
      playbackRate: rate,
      onended: () => {
        source.dispose();
        gain.dispose();
      },
    }).connect(gain);
    source.start(time);
  }

  dispose(): void {
    // Le buffer appartient au moteur (partagé entre remplacements d'instrument).
    this.output.dispose();
  }
}
