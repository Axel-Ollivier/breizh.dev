import * as Tone from 'tone';

import { setTrackInstrument, type Pattern } from '../engine/pattern';
import { degreeToMidi } from '../engine/scales';
import { useAwenStore } from '../state/store';
import { exportFileName, renderPatternWav } from './renderOffline';
import { stepTriggers } from './stepTriggers';
import { Clap } from './instruments/Clap';
import { Hats } from './instruments/Hats';
import { KICK_SLOTS, KickSampler } from './instruments/KickSampler';
import { KickSynth } from './instruments/KickSynth';
import { Pluck } from './instruments/Pluck';
import { Ride } from './instruments/Ride';
import { Screech } from './instruments/Screech';
import { SquareLead } from './instruments/SquareLead';
import { SupersawLead } from './instruments/SupersawLead';
import type { Instrument } from './instruments/types';

interface TrackNodes {
  instrumentId: string;
  instrument: Instrument | null;
  /** Distorsion de piste (wet = drive du modèle, 0 = bypass). */
  distortion: Tone.Distortion;
  /** Ducking contre le kick — pistes mélodiques uniquement. */
  duck: Tone.Gain | null;
  /** Volume/pan par piste, sortie vers le master. */
  channel: Tone.Channel;
  /** Départ post-fader vers le bus FX (delay + reverb). */
  send: Tone.Gain;
}

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
 * - `dispose()` de tout node remplacé (réconciliation) ; teardown HMR global.
 * - Master : gain staging par piste → EQ3 → Limiter (obligatoire, le contenu
 *   est saturé en permanence).
 */
class AudioEngine {
  private initPromise: Promise<void> | null = null;
  private busy = false;
  private repeatId: number | null = null;
  private tracks = new Map<string, TrackNodes>();
  private masterBus: Tone.Gain | null = null;
  private masterEq: Tone.EQ3 | null = null;
  private limiter: Tone.Limiter | null = null;
  private fxInput: Tone.Gain | null = null;
  private fxDelay: Tone.FeedbackDelay | null = null;
  private fxReverb: Tone.Reverb | null = null;
  private kickBuffers: Array<Tone.ToneAudioBuffer | null> = Array.from(
    { length: KICK_SLOTS },
    () => null,
  );
  private unsubscribers: Array<() => void> = [];
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

    // Master : bus -> EQ3 -> Limiter -> destination.
    this.limiter = new Tone.Limiter(-1).toDestination();
    this.masterEq = new Tone.EQ3({ low: 0, mid: 0, high: 0 }).connect(this.limiter);
    this.masterBus = new Tone.Gain(0.9).connect(this.masterEq);

    // Bus FX en sends : delay synchronisé + reverb en parallèle, retour master.
    this.fxDelay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.3, wet: 1 }).connect(
      this.masterBus,
    );
    this.fxReverb = new Tone.Reverb({ decay: 2.4, wet: 1 }).connect(this.masterBus);
    await this.fxReverb.ready;
    this.fxInput = new Tone.Gain(1);
    this.fxInput.fan(this.fxDelay, this.fxReverb);

    this.reconcile(useAwenStore.getState().pattern);
    this.unsubscribers.push(
      useAwenStore.subscribe(
        (s) => s.bpm,
        (bpm) => {
          Tone.getTransport().bpm.value = bpm;
          // La notation '8n.' est convertie en secondes au moment du set :
          // on recale le delay sur le nouveau tempo.
          if (this.fxDelay) this.fxDelay.delayTime.value = Tone.Time('8n.').toSeconds();
        },
      ),
      useAwenStore.subscribe(
        (s) => s.pattern,
        (pattern) => this.reconcile(pattern),
      ),
    );
  }

  /**
   * Aligne les nodes par piste sur le pattern courant : création, changement
   * d'instrument (dispose de l'ancien), mise à jour volume/send, suppression.
   */
  private reconcile(pattern: Pattern): void {
    const masterBus = this.masterBus;
    const fxInput = this.fxInput;
    if (!masterBus || !fxInput) return;

    const seen = new Set<string>();
    for (const track of pattern.tracks) {
      seen.add(track.id);
      let nodes = this.tracks.get(track.id);
      if (!nodes) {
        // Chaîne : instrument -> distorsion -> [duck] -> channel -> master (+ send).
        const channel = new Tone.Channel({ volume: track.volume }).connect(masterBus);
        const send = new Tone.Gain(track.sendFx).connect(fxInput);
        channel.connect(send);
        const duck = track.kind === 'melodic' ? new Tone.Gain(1).connect(channel) : null;
        const distortion = new Tone.Distortion({ distortion: 0.8, wet: track.drive }).connect(
          duck ?? channel,
        );
        nodes = { instrumentId: '', instrument: null, distortion, duck, channel, send };
        this.tracks.set(track.id, nodes);
      }
      if (nodes.instrumentId !== track.instrumentId) {
        nodes.instrument?.dispose();
        nodes.instrument = this.createInstrument(track.instrumentId, nodes.distortion);
        nodes.instrumentId = track.instrumentId;
      }
      nodes.channel.volume.value = track.volume;
      nodes.send.gain.value = track.sendFx;
      nodes.distortion.wet.value = track.drive;
    }

    for (const [id, nodes] of this.tracks) {
      if (seen.has(id)) continue;
      nodes.instrument?.dispose();
      nodes.distortion.dispose();
      nodes.duck?.dispose();
      nodes.channel.dispose();
      nodes.send.dispose();
      this.tracks.delete(id);
    }
  }

  private createInstrument(instrumentId: string, destination: Tone.ToneAudioNode): Instrument | null {
    switch (instrumentId) {
      case 'supersaw':
        return new SupersawLead(destination);
      case 'kick-synth':
        return new KickSynth(destination);
      case 'kick-sampler': {
        if (!this.kickBuffers.some(Boolean)) return null;
        const tonic = degreeToMidi(useAwenStore.getState().scale, 0);
        return new KickSampler(destination, this.kickBuffers, tonic);
      }
      case 'square':
        return new SquareLead(destination);
      case 'pluck':
        return new Pluck(destination);
      case 'screech':
        return new Screech(destination);
      case 'clap':
        return new Clap(destination);
      case 'hats':
        return new Hats(destination);
      case 'ride':
        return new Ride(destination);
      default:
        return null;
    }
  }

  /**
   * Importe un sample de kick dans un slot (drag & drop / input fichier) et
   * bascule la piste kick sur le sampler. Le drop est un geste utilisateur :
   * l'init est permise. Ne rejette jamais (erreur de décodage loguée).
   */
  async loadKickSample(file: File, slot = 0): Promise<void> {
    try {
      await this.ensureInitialized();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(arrayBuffer);
      const buffer = new Tone.ToneAudioBuffer(audioBuffer);
      this.kickBuffers[slot] = buffer;

      const store = useAwenStore.getState();
      store.setKickSampleName(slot, file.name);
      const kick = store.pattern.tracks.find((t) => t.kind === 'kick');
      if (!kick) return;
      if (kick.instrumentId === 'kick-sampler') {
        // Déjà sur le sampler : remplace le buffer de l'instrument en place.
        const nodes = this.tracks.get(kick.id);
        if (nodes?.instrument instanceof KickSampler) {
          nodes.instrument.setBuffer(slot, buffer);
        }
      } else {
        store.setPattern(setTrackInstrument(store.pattern, kick.id, 'kick-sampler'));
      }
    } catch (error) {
      console.error(`Import du sample « ${file.name} » impossible :`, error);
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

  /** Arrêt immédiat (aussi utilisé par l'UI avant une action bloquante). */
  stop(): void {
    Tone.getTransport().stop();
    // Les callbacks Draw déjà planifiés dans la fenêtre de lookahead
    // rallumeraient le playhead après l'arrêt : on purge la file d'abord.
    Tone.getDraw().cancel();
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
   * Export WAV offline (SPECS §5) : stoppe la lecture puis rend N mesures
   * calées sur la barre, avec les mêmes buffers de kick que le temps réel.
   */
  async exportWav(bars: 4 | 8 | 16): Promise<{ blob: Blob; filename: string }> {
    await this.ensureInitialized();
    if (useAwenStore.getState().isPlaying) this.stop();
    const { pattern, bpm, scale, ducking, seed } = useAwenStore.getState();
    const blob = await renderPatternWav({
      pattern,
      bpm,
      scale,
      ducking,
      bars,
      kickBuffers: this.kickBuffers,
      seed,
    });
    return { blob, filename: exportFileName({ seed, scale, bpm, bars }) };
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
    // getTicksAtTime rend un flottant : sans Math.round, ~2 % des frontières
    // de pas retombent sur l'index précédent (double trigger + pas sauté).
    const ticksPerStep = transport.PPQ / 4;
    const step =
      Math.floor(Math.round(transport.getTicksAtTime(time)) / ticksPerStep) %
      pattern.lengthSteps;

    const stepSec = 60 / Tone.getTransport().bpm.value / 4;
    const { triggers, kickHit, tonicMidi } = stepTriggers(pattern, scale, step, stepSec);
    for (const { trackId, resolved } of triggers) {
      const instrument = this.tracks.get(trackId)?.instrument;
      if (!instrument) continue;
      try {
        if (instrument instanceof KickSampler) instrument.rootMidi = tonicMidi;
        instrument.trigger(resolved, time);
      } catch (error) {
        // Un pitch invalide (pattern écrit sans passer par les opérations)
        // ne doit pas tuer le tick des autres pistes ni le playhead.
        console.error(`Trigger impossible (piste ${trackId}, pas ${step}) :`, error);
      }
    }

    // Ducking : les pistes mélodiques plongent brièvement quand un kick
    // audible tombe sur ce pas (enveloppe de gain simple).
    if (kickHit && useAwenStore.getState().ducking) {
      for (const nodes of this.tracks.values()) {
        const duck = nodes.duck;
        if (!duck) continue;
        duck.gain.cancelScheduledValues(time);
        duck.gain.setValueAtTime(0.2, time);
        duck.gain.linearRampToValueAtTime(1, time + Math.min(0.16, stepSec * 1.6));
      }
    }

    // Onglet caché : rAF est suspendu, la file Draw grossirait sans être
    // drainée — on ne planifie le visuel que si l'onglet est visible.
    if (!document.hidden) {
      Tone.getDraw().schedule(() => {
        if (useAwenStore.getState().isPlaying) this.notifyStep(step);
      }, time);
    }
  }

  private disposeNodes(): void {
    for (const nodes of this.tracks.values()) {
      nodes.instrument?.dispose();
      nodes.channel.dispose();
      nodes.send.dispose();
    }
    this.tracks.clear();
    this.fxInput?.dispose();
    this.fxDelay?.dispose();
    this.fxReverb?.dispose();
    this.masterBus?.dispose();
    this.masterEq?.dispose();
    this.limiter?.dispose();
    this.fxInput = this.fxDelay = this.fxReverb = null;
    this.masterBus = this.masterEq = this.limiter = null;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
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
