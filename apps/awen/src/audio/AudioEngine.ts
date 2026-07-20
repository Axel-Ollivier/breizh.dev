import * as Tone from 'tone';

import { useAwenStore } from '../state/store';

/**
 * Encapsulation Tone.js — seul module (avec `instruments/`) à importer 'tone'.
 *
 * Contrat (CLAUDE.md, règles d'or) :
 * - `Tone.start()` uniquement après un geste utilisateur (premier `start()`).
 * - Tout le scheduling passe par le Transport ; le `time` du callback est
 *   transmis aux triggers, et le pas courant est dérivé de la position du
 *   Transport (jamais un compteur parallèle, jamais l'horloge JS).
 * - Le moteur lit le store à chaque tick : l'édition pendant la lecture est
 *   prise en compte au pas suivant.
 * - `dispose()` de tout node remplacé ; teardown global en dev pour le HMR.
 *
 * Phase 1 : pas encore d'instruments — un click de métronome (noires, accent
 * en début de mesure) sert de preuve de vie sonore. Retiré en phase 2.
 */
class AudioEngine {
  private initPromise: Promise<void> | null = null;
  private busy = false;
  private repeatId: number | null = null;
  private click: Tone.Synth | null = null;
  private unsubscribeBpm: (() => void) | null = null;

  /** Init mémoïsée : deux appels concurrents partagent la même promesse. */
  private ensureInitialized(): Promise<void> {
    if (this.initPromise === null) {
      this.initPromise = this.initialize();
      // Init échouée : tout libérer pour qu'un prochain geste retente à zéro.
      this.initPromise.catch(() => this.disposeNodes());
    }
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    await Tone.start();
    this.click = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
      volume: -12,
    }).toDestination();
    this.unsubscribeBpm = useAwenStore.subscribe(
      (s) => s.bpm,
      (bpm) => {
        Tone.getTransport().bpm.value = bpm;
      },
    );
  }

  private async start(): Promise<void> {
    await this.ensureInitialized();
    const transport = Tone.getTransport();
    transport.bpm.value = useAwenStore.getState().bpm;
    if (this.repeatId === null) {
      this.repeatId = transport.scheduleRepeat((time) => this.onTick(time), '16n');
    }
    transport.start();
    useAwenStore.getState().setPlaying(true);
  }

  private stop(): void {
    Tone.getTransport().stop();
    useAwenStore.getState().setPlaying(false);
  }

  /** Ne rejette jamais : les erreurs audio sont loguées et l'état reste cohérent. */
  async toggle(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (useAwenStore.getState().isPlaying) this.stop();
      else await this.start();
    } catch (error) {
      useAwenStore.getState().setPlaying(false);
      console.error('Démarrage audio impossible :', error);
    } finally {
      this.busy = false;
    }
  }

  private onTick(time: number): void {
    const { pattern } = useAwenStore.getState();
    const transport = Tone.getTransport();
    // Pas courant dérivé de la position du Transport (ticks → double-croches).
    const ticksPerStep = transport.PPQ / 4;
    const step =
      Math.floor(transport.getTicksAtTime(time) / ticksPerStep) % pattern.lengthSteps;

    // Phase 1 : click sur les noires, accent sur le premier temps de chaque mesure.
    if (step % 4 === 0) {
      const accent = step % 16 === 0;
      this.click?.triggerAttackRelease(accent ? 1760 : 880, '64n', time, accent ? 0.9 : 0.4);
    }
  }

  private disposeNodes(): void {
    this.click?.dispose();
    this.click = null;
    this.unsubscribeBpm?.();
    this.unsubscribeBpm = null;
    this.initPromise = null;
  }

  /** Teardown global (HMR Vite) : libère tous les nodes et le scheduling. */
  dispose(): void {
    const transport = Tone.getTransport();
    transport.stop();
    if (this.repeatId !== null) {
      transport.clear(this.repeatId);
      this.repeatId = null;
    }
    this.disposeNodes();
    useAwenStore.getState().setPlaying(false);
  }
}

export const audioEngine = new AudioEngine();

if (import.meta.hot) {
  import.meta.hot.dispose(() => audioEngine.dispose());
}
