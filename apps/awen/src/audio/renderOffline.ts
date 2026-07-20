import * as Tone from 'tone';

import type { Pattern } from '../engine/pattern';
import { midiToNoteName, type Scale } from '../engine/scales';
import { Clap } from './instruments/Clap';
import { Hats } from './instruments/Hats';
import { KickSampler } from './instruments/KickSampler';
import { KickSynth } from './instruments/KickSynth';
import { Pluck } from './instruments/Pluck';
import { Ride } from './instruments/Ride';
import { Screech } from './instruments/Screech';
import { SquareLead } from './instruments/SquareLead';
import { SupersawLead } from './instruments/SupersawLead';
import type { Instrument } from './instruments/types';
import { stepTriggers } from './stepTriggers';

export interface RenderOptions {
  pattern: Pattern;
  bpm: number;
  scale: Scale;
  ducking: boolean;
  bars: 4 | 8 | 16;
  kickBuffers: Array<Tone.ToneAudioBuffer | null>;
  seed: number;
}

/**
 * Rendu offline déterministe (SPECS §5) : boucle le pattern sur N mesures,
 * départ/arrêt calés sur la barre, même chaîne audio que le temps réel
 * (résolution des pas partagée via stepTriggers). Sort un WAV 16 bits.
 */
export async function renderPatternWav(opts: RenderOptions): Promise<Blob> {
  const { pattern, bpm, scale, ducking, bars, kickBuffers } = opts;
  const stepSec = 60 / bpm / 4;
  const totalSteps = bars * 16;
  const tailSec = 1.2; // queue de reverb/delay après la dernière barre
  const duration = totalSteps * stepSec + tailSec;

  const buffer = await Tone.Offline(async () => {
    // Master identique au temps réel : bus -> EQ3 -> Limiter -> destination.
    const limiter = new Tone.Limiter(-1).toDestination();
    const masterEq = new Tone.EQ3().connect(limiter);
    const masterBus = new Tone.Gain(0.9).connect(masterEq);
    const fxDelay = new Tone.FeedbackDelay({
      delayTime: stepSec * 6, // '8n.' au bpm du rendu
      feedback: 0.3,
      wet: 1,
    }).connect(masterBus);
    const fxReverb = new Tone.Reverb({ decay: 2.4, wet: 1 }).connect(masterBus);
    await fxReverb.ready;
    const fxInput = new Tone.Gain(1);
    fxInput.fan(fxDelay, fxReverb);

    const instruments = new Map<string, Instrument>();
    const ducks: Tone.Gain[] = [];
    for (const track of pattern.tracks) {
      const channel = new Tone.Channel({ volume: track.volume }).connect(masterBus);
      const send = new Tone.Gain(track.sendFx).connect(fxInput);
      channel.connect(send);
      const duck = track.kind === 'melodic' ? new Tone.Gain(1).connect(channel) : null;
      if (duck) ducks.push(duck);
      const distortion = new Tone.Distortion({ distortion: 0.8, wet: track.drive }).connect(
        duck ?? channel,
      );
      const instrument = createInstrument(track.instrumentId, distortion, kickBuffers, scale);
      if (instrument) instruments.set(track.id, instrument);
    }

    for (let k = 0; k < totalSteps; k++) {
      const step = k % pattern.lengthSteps;
      const time = k * stepSec;
      const { triggers, kickHit, tonicMidi } = stepTriggers(pattern, scale, step, stepSec);
      for (const { trackId, resolved } of triggers) {
        const instrument = instruments.get(trackId);
        if (!instrument) continue;
        if (instrument instanceof KickSampler) instrument.rootMidi = tonicMidi;
        instrument.trigger(resolved, time);
      }
      if (kickHit && ducking) {
        for (const duck of ducks) {
          duck.gain.cancelScheduledValues(time);
          duck.gain.setValueAtTime(0.2, time);
          duck.gain.linearRampToValueAtTime(1, time + Math.min(0.16, stepSec * 1.6));
        }
      }
    }
  }, duration);

  return new Blob([encodeWav(buffer)], { type: 'audio/wav' });
}

function createInstrument(
  instrumentId: string,
  destination: Tone.ToneAudioNode,
  kickBuffers: Array<Tone.ToneAudioBuffer | null>,
  scale: Scale,
): Instrument | null {
  switch (instrumentId) {
    case 'supersaw':
      return new SupersawLead(destination);
    case 'square':
      return new SquareLead(destination);
    case 'pluck':
      return new Pluck(destination);
    case 'screech':
      return new Screech(destination);
    case 'kick-synth':
      return new KickSynth(destination);
    case 'kick-sampler':
      return kickBuffers.some(Boolean)
        ? new KickSampler(destination, kickBuffers, scale.rootMidi)
        : null;
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

/** `awen_hardstyle_seed4242_fmin_150bpm_8bars.wav` */
export function exportFileName(opts: Pick<RenderOptions, 'seed' | 'scale' | 'bpm' | 'bars'>): string {
  const tonic = midiToNoteName(opts.scale.rootMidi)
    .replace(/\d+$/, '')
    .replace('#', 's')
    .toLowerCase();
  const mode = opts.scale.mode === 'minorHarmonic' ? 'minh' : 'min';
  return `awen_hardstyle_seed${opts.seed}_${tonic}${mode}_${opts.bpm}bpm_${opts.bars}bars.wav`;
}

/** Encode un ToneAudioBuffer en WAV PCM 16 bits. */
function encodeWav(buffer: Tone.ToneAudioBuffer): ArrayBuffer {
  const channels = buffer.toArray() as Float32Array[] | Float32Array;
  const chans: Float32Array[] = Array.isArray(channels) ? channels : [channels];
  const numChannels = chans.length;
  const length = chans[0]?.length ?? 0;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const dataSize = length * numChannels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (const chan of chans) {
      const sample = Math.max(-1, Math.min(1, chan[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}
