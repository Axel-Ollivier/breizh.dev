import * as Tone from 'tone';

import { DEFAULT_VELOCITY, type Track } from '../engine/pattern';
import { degreeToMidi } from '../engine/scales';
import { useAwenStore } from '../state/store';
import { SupersawLead } from './instruments/SupersawLead';
import type { Instrument } from './instruments/types';

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
 * - La position visuelle (playhead) passe par `Tone.Draw` : l'UI s'abonne via
 *   `subscribeStep`, aucun setState à la cadence audio.
 * - `dispose()` de tout node remplacé ; teardown global en dev pour le HMR.
 */
class AudioEngine {
  private initPromise: Promise<void> | null = null;
  private busy = false;
  private repeatId: number | null = null;
  private instruments = new Map<string, Instrument>();
  private unsubscribeBpm: (() => void) | null = null;
  private stepListeners = new Set<(step: number) => void>();

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
    const destination = Tone.getDestination();
    for (const track of useAwenStore.getState().pattern.tracks) {
      const instrument = this.createInstrument(track, destination);
      if (instrument) this.instruments.set(track.id, instrument);
    }
    this.unsubscribeBpm = useAwenStore.subscribe(
      (s) => s.bpm,
      (bpm) => {
        Tone.getTransport().bpm.value = bpm;
      },
    );
  }

  /** Phase 2 : seul le lead mélodique existe ; kicks et percus en phase 3. */
  private createInstrument(track: Track, destination: Tone.ToneAudioNode): Instrument | null {
    switch (track.instrumentId) {
      case 'supersaw':
        return new SupersawLead(destination);
      default:
        return null;
    }
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
    this.notifyStep(-1);
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

  /**
   * Playhead : l'UI s'abonne ici ; les callbacks sont invoqués via `Tone.Draw`
   * au moment audio du pas (`-1` = lecture arrêtée). Retourne le désabonnement.
   */
  subscribeStep(listener: (step: number) => void): () => void {
    this.stepListeners.add(listener);
    return () => this.stepListeners.delete(listener);
  }

  private notifyStep(step: number): void {
    for (const listener of this.stepListeners) listener(step);
  }

  private onTick(time: number): void {
    const { pattern, scale } = useAwenStore.getState();
    const transport = Tone.getTransport();
    // Pas courant dérivé de la position du Transport (ticks → double-croches).
    const ticksPerStep = transport.PPQ / 4;
    const step = Math.floor(transport.getTicksAtTime(time) / ticksPerStep) % pattern.lengthSteps;

    const anySolo = pattern.tracks.some((t) => t.solo);
    for (const track of pattern.tracks) {
      if (track.mute || (anySolo && !track.solo)) continue;
      const instrument = this.instruments.get(track.id);
      const stepData = track.steps[step];
      if (!instrument || !stepData?.on || stepData.pitch === undefined) continue;
      instrument.trigger(
        {
          midi: degreeToMidi(scale, stepData.pitch),
          velocity: stepData.vel ?? DEFAULT_VELOCITY,
        },
        time,
      );
    }

    Tone.getDraw().schedule(() => this.notifyStep(step), time);
  }

  private disposeNodes(): void {
    for (const instrument of this.instruments.values()) instrument.dispose();
    this.instruments.clear();
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
    this.stepListeners.clear();
    useAwenStore.getState().setPlaying(false);
  }
}

export const audioEngine = new AudioEngine();

if (import.meta.hot) {
  import.meta.hot.dispose(() => audioEngine.dispose());
}
