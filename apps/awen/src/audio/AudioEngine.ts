import * as Tone from 'tone';

import { useAwenStore } from '../state/store';

/**
 * Encapsulation Tone.js — seul module (avec `instruments/`) à importer 'tone'.
 *
 * Contrat (CLAUDE.md, règles d'or) :
 * - `Tone.start()` uniquement après un geste utilisateur (premier `start()`).
 * - Tout le scheduling passe par le Transport ; le `time` du callback est
 *   transmis aux triggers, jamais l'horloge JS.
 * - Le moteur lit le store à chaque tick : l'édition pendant la lecture est
 *   prise en compte au pas suivant.
 * - `dispose()` de tout node remplacé ; teardown global en dev pour le HMR.
 *
 * Phase 1 : pas encore d'instruments — un click de métronome (noires, accent
 * en début de mesure) sert de preuve de vie sonore. Retiré en phase 2.
 */
class AudioEngine {
  private initialized = false;
  private repeatId: number | null = null;
  private stepIndex = 0;
  private click: Tone.Synth | null = null;
  private unsubscribeBpm: (() => void) | null = null;

  async start(): Promise<void> {
    if (!this.initialized) {
      await Tone.start();
      this.click = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
        volume: -12,
      }).toDestination();
      this.unsubscribeBpm = useAwenStore.subscribe((state, prev) => {
        if (state.bpm !== prev.bpm) Tone.getTransport().bpm.value = state.bpm;
      });
      this.initialized = true;
    }

    const transport = Tone.getTransport();
    transport.bpm.value = useAwenStore.getState().bpm;
    this.stepIndex = 0;
    if (this.repeatId === null) {
      this.repeatId = transport.scheduleRepeat((time) => this.onTick(time), '16n');
    }
    transport.start();
    useAwenStore.getState().setPlaying(true);
  }

  stop(): void {
    Tone.getTransport().stop();
    this.stepIndex = 0;
    useAwenStore.getState().setPlaying(false);
  }

  async toggle(): Promise<void> {
    if (useAwenStore.getState().isPlaying) this.stop();
    else await this.start();
  }

  private onTick(time: number): void {
    const { pattern } = useAwenStore.getState();
    const step = this.stepIndex % pattern.lengthSteps;

    // Phase 1 : click sur les noires, accent sur le premier temps de chaque mesure.
    if (step % 4 === 0) {
      const accent = step % 16 === 0;
      this.click?.triggerAttackRelease(accent ? 1760 : 880, '64n', time, accent ? 0.9 : 0.4);
    }

    this.stepIndex = step + 1;
  }

  /** Teardown global (HMR Vite) : libère tous les nodes et le scheduling. */
  dispose(): void {
    const transport = Tone.getTransport();
    transport.stop();
    if (this.repeatId !== null) {
      transport.clear(this.repeatId);
      this.repeatId = null;
    }
    this.click?.dispose();
    this.click = null;
    this.unsubscribeBpm?.();
    this.unsubscribeBpm = null;
    this.initialized = false;
    useAwenStore.getState().setPlaying(false);
  }
}

export const audioEngine = new AudioEngine();

if (import.meta.hot) {
  import.meta.hot.dispose(() => audioEngine.dispose());
}
