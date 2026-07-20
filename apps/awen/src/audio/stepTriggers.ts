import { DEFAULT_VELOCITY, resolveKickPitch, type Pattern } from '../engine/pattern';
import { degreeToMidi, type Scale } from '../engine/scales';
import type { ResolvedStep } from './instruments/types';

export interface TrackTrigger {
  trackId: string;
  isKick: boolean;
  resolved: ResolvedStep;
}

export interface StepTriggers {
  triggers: TrackTrigger[];
  /** Un kick audible tombe sur ce pas (pilote le ducking). */
  kickHit: boolean;
  tonicMidi: number;
}

/**
 * Résolution complète d'un pas : mute/solo, pitch (degré -> MIDI),
 * expressivité kick (gate/bend/variant), durées mélodiques. Partagée entre la
 * lecture temps réel (AudioEngine.onTick) et le rendu offline — un seul
 * chemin de vérité pour « ce qui se joue à ce pas ».
 */
export function stepTriggers(
  pattern: Pattern,
  scale: Scale,
  step: number,
  stepSec: number,
): StepTriggers {
  const anySolo = pattern.tracks.some((t) => t.solo);
  const tonicMidi = degreeToMidi(scale, 0);
  const triggers: TrackTrigger[] = [];
  let kickHit = false;

  for (const track of pattern.tracks) {
    if (track.mute || (anySolo && !track.solo)) continue;
    const stepData = track.steps[step];
    if (!stepData?.on) continue;

    let midi: number;
    let expressive: Partial<ResolvedStep> = {};
    if (track.kind === 'melodic') {
      // Seules les pistes mélodiques exigent un pitch par pas.
      if (stepData.pitch === undefined) continue;
      midi = degreeToMidi(scale, stepData.pitch);
      if (stepData.len !== undefined) {
        expressive = { durationSec: stepData.len * stepSec * 0.95 };
      }
    } else if (track.kind === 'kick') {
      // Pitch lane > suivi bassline > hauteur native (tonique).
      const degree = resolveKickPitch(pattern, track, step);
      midi = degree === undefined ? tonicMidi : degreeToMidi(scale, degree);
      kickHit = true;
      expressive = {
        ...(stepData.gate !== undefined ? { durationSec: stepSec * stepData.gate } : {}),
        ...(stepData.bend !== undefined ? { bendSemitones: stepData.bend } : {}),
        ...(stepData.variant !== undefined ? { variant: stepData.variant } : {}),
      };
    } else {
      midi = tonicMidi; // percs : la hauteur est ignorée par les instruments
    }

    triggers.push({
      trackId: track.id,
      isKick: track.kind === 'kick',
      resolved: { midi, velocity: stepData.vel ?? DEFAULT_VELOCITY, ...expressive },
    });
  }

  return { triggers, kickHit, tonicMidi };
}
