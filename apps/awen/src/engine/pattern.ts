// Modèle du pattern — logique pure, source de vérité unique de l'app.
// Toutes les opérations retournent un nouveau Pattern, jamais de mutation.
// Invariants : voir SPECS.md §2 (et `validatePattern` ci-dessous, utilisé par les tests).

export type PatternLength = 16 | 32 | 48 | 64;

export type TrackKind = 'melodic' | 'kick' | 'perc';

export interface Step {
  on: boolean;
  /** Index de degré dans la gamme courante (SPECS §1.2) — jamais une note MIDI. */
  pitch?: number;
  /** Vélocité [0, 1] ; absente = DEFAULT_VELOCITY appliquée au trigger. */
  vel?: number;
  /**
   * Kick uniquement : durée relative au pas, dans GATE_LEVELS (1 = longueur
   * naturelle de l'instrument, 0.5 / 0.25 = kicks courts pour les rolls).
   */
  gate?: number;
  /** Kick uniquement : pitch bend court en demi-tons [-12, 12] (départ décalé, glissé vers la note). */
  bend?: number;
  /** Kick uniquement : variante d'instrument du pas (0..2 — preset synthé ou slot sampler). */
  variant?: number;
  /** Mélodique uniquement : durée de la note en pas (≥ 2 ; absent = 1 pas). */
  len?: number;
}

/** Durées de kick cyclées par alt+clic (1 = naturelle). */
export const GATE_LEVELS = [1, 0.5, 0.25] as const;

export const KICK_VARIANTS = 3;
export const BEND_RANGE = 12;

export interface PitchRange {
  min: number;
  max: number;
}

export interface Track {
  id: string;
  kind: TrackKind;
  instrumentId: string;
  /** INVARIANT : steps.length === pattern.lengthSteps */
  steps: Step[];
  /** dB, [-60, +6] */
  volume: number;
  mute: boolean;
  solo: boolean;
  /** [0, 1], niveau vers le bus send */
  sendFx: number;
  /** [0, 1], distorsion de la piste (0 = bypass) */
  drive: number;
  /** Plage de degrés autorisée — pistes melodic et kick uniquement. */
  pitchRange?: PitchRange;
  /** Kick uniquement : lit les pitchs sur cette piste mélodique au lieu de la pitch lane. */
  followTrackId?: string;
}

export interface Pattern {
  lengthSteps: PatternLength;
  tracks: Track[];
}

export interface TrackDef {
  id: string;
  kind: TrackKind;
  instrumentId: string;
  pitchRange?: PitchRange;
  drive?: number;
}

export const DEFAULT_VELOCITY = 0.8;

export const PATTERN_LENGTHS: readonly PatternLength[] = [16, 32, 48, 64];

const emptyStep = (): Step => ({ on: false });

export function createPattern(lengthSteps: PatternLength, trackDefs: TrackDef[]): Pattern {
  const ids = new Set(trackDefs.map((t) => t.id));
  if (ids.size !== trackDefs.length) {
    throw new Error('createPattern: ids de pistes non uniques');
  }
  return {
    lengthSteps,
    tracks: trackDefs.map((def) => ({
      id: def.id,
      kind: def.kind,
      instrumentId: def.instrumentId,
      steps: Array.from({ length: lengthSteps }, emptyStep),
      volume: 0,
      mute: false,
      solo: false,
      sendFx: 0,
      drive: def.drive !== undefined ? clamp(def.drive, 0, 1) : 0,
      ...(def.pitchRange !== undefined ? { pitchRange: def.pitchRange } : {}),
    })),
  };
}

function getTrack(pattern: Pattern, trackId: string): Track {
  const track = pattern.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Piste inconnue : ${trackId}`);
  return track;
}

function getStep(track: Track, stepIndex: number): Step {
  const step = track.steps[stepIndex];
  if (step === undefined) {
    throw new Error(`Pas hors grille : ${stepIndex} (piste ${track.id})`);
  }
  return step;
}

function withTrack(pattern: Pattern, trackId: string, update: (track: Track) => Track): Pattern {
  getTrack(pattern, trackId);
  return {
    ...pattern,
    tracks: pattern.tracks.map((t) => (t.id === trackId ? update(t) : t)),
  };
}

function withStep(
  pattern: Pattern,
  trackId: string,
  stepIndex: number,
  update: (step: Step, track: Track) => Step,
): Pattern {
  return withTrack(pattern, trackId, (track) => {
    const step = getStep(track, stepIndex);
    return {
      ...track,
      steps: track.steps.map((s, i) => (i === stepIndex ? update(step, track) : s)),
    };
  });
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function clampPitch(track: Track, pitch: number): number {
  if (!Number.isFinite(pitch)) {
    throw new Error(`Pitch non fini : ${pitch} (piste ${track.id})`);
  }
  const rounded = Math.round(pitch);
  return track.pitchRange
    ? clamp(rounded, track.pitchRange.min, track.pitchRange.max)
    : rounded;
}

/**
 * Active/désactive un pas. Sur une piste mélodique, `pitch` est requis à
 * l'activation (invariant 4) ; sur une piste perc il est ignoré.
 * Désactiver un pas efface son pitch et sa vélocité.
 */
export function toggleStep(
  pattern: Pattern,
  trackId: string,
  stepIndex: number,
  pitch?: number,
): Pattern {
  return withStep(pattern, trackId, stepIndex, (step, track) => {
    if (step.on) return emptyStep();
    if (track.kind === 'perc') return { on: true };
    if (track.kind === 'melodic') {
      if (pitch === undefined) {
        throw new Error(`toggleStep: pitch requis sur la piste mélodique ${track.id}`);
      }
      return { on: true, pitch: clampPitch(track, pitch) };
    }
    // kick : pitch optionnel (pitch lane ou followTrackId)
    return pitch === undefined ? { on: true } : { on: true, pitch: clampPitch(track, pitch) };
  });
}

export function setStepVelocity(
  pattern: Pattern,
  trackId: string,
  stepIndex: number,
  vel: number,
): Pattern {
  if (!Number.isFinite(vel)) {
    throw new Error(`Vélocité non finie : ${vel} (piste ${trackId})`);
  }
  return withStep(pattern, trackId, stepIndex, (step) => ({
    ...step,
    vel: clamp(vel, 0, 1),
  }));
}

export function setStepPitch(
  pattern: Pattern,
  trackId: string,
  stepIndex: number,
  pitch: number,
): Pattern {
  return withStep(pattern, trackId, stepIndex, (step, track) => {
    if (track.kind === 'perc') {
      throw new Error(`setStepPitch: pas de pitch sur une piste perc (${track.id})`);
    }
    return { ...step, pitch: clampPitch(track, pitch) };
  });
}

/** Re-cape la durée d'une note à la fin du pattern (invariant len, SPECS §2). */
function capLen(step: Step, index: number, lengthSteps: number): Step {
  if (step.len === undefined || index + step.len <= lengthSteps) return step;
  const capped = lengthSteps - index;
  const { len: _drop, ...rest } = step;
  return capped <= 1 ? rest : { ...rest, len: capped };
}

/**
 * Extension : nouveaux pas off. Réduction : troncature (les données coupées
 * sont perdues — l'UI est responsable de confirmer si la zone n'est pas vide) ;
 * les notes tenues qui débordent la nouvelle fin sont re-capées.
 */
export function resizePattern(pattern: Pattern, newLength: PatternLength): Pattern {
  if (newLength === pattern.lengthSteps) return pattern;
  return {
    lengthSteps: newLength,
    tracks: pattern.tracks.map((track) => ({
      ...track,
      steps:
        newLength < track.steps.length
          ? track.steps.slice(0, newLength).map((s, i) => capLen(s, i, newLength))
          : [
              ...track.steps,
              ...Array.from({ length: newLength - track.steps.length }, emptyStep),
            ],
    })),
  };
}

function kickOnly(track: Track, what: string): void {
  if (track.kind !== 'kick') {
    throw new Error(`${what} réservé aux pistes kick (${track.id})`);
  }
}

/** Efface le pitch d'un pas (kick : retour à la hauteur native / au suivi). */
export function clearStepPitch(pattern: Pattern, trackId: string, stepIndex: number): Pattern {
  return withStep(pattern, trackId, stepIndex, (step, track) => {
    kickOnly(track, 'clearStepPitch');
    const { pitch: _drop, ...rest } = step;
    return rest;
  });
}

/** Durée relative d'un pas de kick (GATE_LEVELS ; 1 = retire le champ). */
export function setStepGate(
  pattern: Pattern,
  trackId: string,
  stepIndex: number,
  gate: number,
): Pattern {
  if (!GATE_LEVELS.includes(gate as (typeof GATE_LEVELS)[number])) {
    throw new Error(`Gate hors GATE_LEVELS : ${gate}`);
  }
  return withStep(pattern, trackId, stepIndex, (step, track) => {
    kickOnly(track, 'setStepGate');
    const { gate: _drop, ...rest } = step;
    return gate === 1 ? rest : { ...rest, gate };
  });
}

/** Pitch bend d'un pas de kick, demi-tons entiers clampés (0 = retire le champ). */
export function setStepBend(
  pattern: Pattern,
  trackId: string,
  stepIndex: number,
  bend: number,
): Pattern {
  if (!Number.isFinite(bend)) throw new Error(`Bend non fini : ${bend}`);
  const clamped = clamp(Math.round(bend), -BEND_RANGE, BEND_RANGE);
  return withStep(pattern, trackId, stepIndex, (step, track) => {
    kickOnly(track, 'setStepBend');
    const { bend: _drop, ...rest } = step;
    return clamped === 0 ? rest : { ...rest, bend: clamped };
  });
}

/** Variante d'instrument d'un pas de kick (0..KICK_VARIANTS-1 ; 0 = retire le champ). */
export function setStepVariant(
  pattern: Pattern,
  trackId: string,
  stepIndex: number,
  variant: number,
): Pattern {
  if (!Number.isInteger(variant) || variant < 0 || variant >= KICK_VARIANTS) {
    throw new Error(`Variante hors [0, ${KICK_VARIANTS - 1}] : ${variant}`);
  }
  return withStep(pattern, trackId, stepIndex, (step, track) => {
    kickOnly(track, 'setStepVariant');
    const { variant: _drop, ...rest } = step;
    return variant === 0 ? rest : { ...rest, variant };
  });
}

/**
 * Active/désactive le suivi de bassline d'une piste kick (SPECS §1.3).
 * `followTrackId` doit pointer une piste mélodique existante.
 */
export function setTrackFollow(
  pattern: Pattern,
  trackId: string,
  followTrackId: string | undefined,
): Pattern {
  if (followTrackId !== undefined) {
    const target = pattern.tracks.find((t) => t.id === followTrackId);
    if (!target) throw new Error(`Piste suivie inconnue : ${followTrackId}`);
    if (target.kind !== 'melodic') {
      throw new Error(`followTrackId doit pointer une piste mélodique (${followTrackId})`);
    }
  }
  return withTrack(pattern, trackId, (track) => {
    if (track.kind !== 'kick') {
      throw new Error(`followTrackId réservé aux pistes kick (${track.id})`);
    }
    const { followTrackId: _drop, ...rest } = track;
    return followTrackId === undefined ? rest : { ...rest, followTrackId };
  });
}

/** Change l'instrument d'une piste (rack). */
export function setTrackInstrument(
  pattern: Pattern,
  trackId: string,
  instrumentId: string,
): Pattern {
  return withTrack(pattern, trackId, (track) => ({ ...track, instrumentId }));
}

export function setTrackVolume(pattern: Pattern, trackId: string, volume: number): Pattern {
  if (!Number.isFinite(volume)) throw new Error(`Volume non fini : ${volume}`);
  return withTrack(pattern, trackId, (track) => ({
    ...track,
    volume: clamp(volume, -60, 6),
  }));
}

export function setTrackMute(pattern: Pattern, trackId: string, mute: boolean): Pattern {
  return withTrack(pattern, trackId, (track) => ({ ...track, mute }));
}

export function setTrackSolo(pattern: Pattern, trackId: string, solo: boolean): Pattern {
  return withTrack(pattern, trackId, (track) => ({ ...track, solo }));
}

export function setTrackSend(pattern: Pattern, trackId: string, sendFx: number): Pattern {
  if (!Number.isFinite(sendFx)) throw new Error(`Send non fini : ${sendFx}`);
  return withTrack(pattern, trackId, (track) => ({
    ...track,
    sendFx: clamp(sendFx, 0, 1),
  }));
}

export function setTrackDrive(pattern: Pattern, trackId: string, drive: number): Pattern {
  if (!Number.isFinite(drive)) throw new Error(`Drive non fini : ${drive}`);
  return withTrack(pattern, trackId, (track) => ({
    ...track,
    drive: clamp(drive, 0, 1),
  }));
}

/** Durée d'une note mélodique en pas (1 = retire le champ). */
export function setStepLen(
  pattern: Pattern,
  trackId: string,
  stepIndex: number,
  len: number,
): Pattern {
  if (!Number.isInteger(len) || len < 1) throw new Error(`Durée invalide : ${len}`);
  return withStep(pattern, trackId, stepIndex, (step, track) => {
    if (track.kind !== 'melodic') {
      throw new Error(`setStepLen réservé aux pistes mélodiques (${track.id})`);
    }
    const capped = Math.min(len, pattern.lengthSteps - stepIndex);
    const { len: _drop, ...rest } = step;
    return capped <= 1 ? rest : { ...rest, len: capped };
  });
}

/** Copie une mesure (16 pas) vers une autre, toutes pistes confondues. */
export function copyMeasure(pattern: Pattern, fromMeasure: number, toMeasure: number): Pattern {
  const measures = pattern.lengthSteps / 16;
  if (
    !Number.isInteger(fromMeasure) ||
    !Number.isInteger(toMeasure) ||
    fromMeasure < 0 ||
    toMeasure < 0 ||
    fromMeasure >= measures ||
    toMeasure >= measures
  ) {
    throw new Error(`Mesure hors pattern : ${fromMeasure} -> ${toMeasure}`);
  }
  if (fromMeasure === toMeasure) return pattern;
  return {
    ...pattern,
    tracks: pattern.tracks.map((track) => ({
      ...track,
      steps: track.steps.map((step, i) => {
        const measure = Math.floor(i / 16);
        if (measure !== toMeasure) return step;
        // Une note tenue copiée près de la fin est re-capée (invariant len).
        return capLen({ ...track.steps[fromMeasure * 16 + (i % 16)]! }, i, pattern.lengthSteps);
      }),
    })),
  };
}

/**
 * Pitch effectif d'un pas de kick (SPECS §1.3) : pitch propre, sinon — si la
 * piste suit une piste mélodique — dernière note démarrée ≤ pas dans la mesure,
 * sinon tonique (degré 0). Retourne undefined pour « hauteur native » (kick
 * sans pitch ni suivi).
 */
export function resolveKickPitch(
  pattern: Pattern,
  kickTrack: Track,
  stepIndex: number,
): number | undefined {
  const step = kickTrack.steps[stepIndex];
  if (step?.pitch !== undefined) return step.pitch;
  if (kickTrack.followTrackId === undefined) return undefined;
  const followed = pattern.tracks.find((t) => t.id === kickTrack.followTrackId);
  if (!followed) return 0;
  const measureStart = stepIndex - (stepIndex % 16);
  for (let i = stepIndex; i >= measureStart; i--) {
    const s = followed.steps[i];
    if (s?.on && s.pitch !== undefined) return s.pitch;
  }
  return 0;
}

/** Ajoute une piste vide à la longueur du pattern (id unique exigé). */
export function addTrack(pattern: Pattern, def: TrackDef): Pattern {
  if (pattern.tracks.some((t) => t.id === def.id)) {
    throw new Error(`Id de piste déjà pris : ${def.id}`);
  }
  const [track] = createPattern(pattern.lengthSteps, [def]).tracks;
  return { ...pattern, tracks: [...pattern.tracks, track!] };
}

/**
 * Retire une piste ; les kicks qui la suivaient perdent leur `followTrackId`
 * (retour pitch lane) pour préserver l'invariant 5.
 */
export function removeTrack(pattern: Pattern, trackId: string): Pattern {
  getTrack(pattern, trackId);
  return {
    ...pattern,
    tracks: pattern.tracks
      .filter((t) => t.id !== trackId)
      .map((t) => {
        if (t.followTrackId !== trackId) return t;
        const { followTrackId: _drop, ...rest } = t;
        return rest;
      }),
  };
}

export function clearTrack(pattern: Pattern, trackId: string): Pattern {
  return withTrack(pattern, trackId, (track) => ({
    ...track,
    steps: track.steps.map(emptyStep),
  }));
}

/**
 * Vérifie les invariants de SPECS §2. Retourne la liste des violations
 * (vide = pattern valide). Utilisé par les tests, utilisable en garde-fou dev.
 */
export function validatePattern(pattern: Pattern): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const track of pattern.tracks) {
    if (ids.has(track.id)) errors.push(`id de piste dupliqué : ${track.id}`);
    ids.add(track.id);

    if (track.steps.length !== pattern.lengthSteps) {
      errors.push(
        `${track.id}: steps.length (${track.steps.length}) !== lengthSteps (${pattern.lengthSteps})`,
      );
    }

    if (track.followTrackId !== undefined) {
      if (track.kind !== 'kick') {
        errors.push(`${track.id}: followTrackId sur une piste ${track.kind}`);
      }
      const target = pattern.tracks.find((t) => t.id === track.followTrackId);
      if (!target) errors.push(`${track.id}: followTrackId pointe une piste inconnue`);
      else if (target.kind !== 'melodic') {
        errors.push(`${track.id}: followTrackId pointe une piste ${target.kind}`);
      }
    }

    track.steps.forEach((step, i) => {
      if (step.pitch !== undefined) {
        if (track.kind === 'perc') errors.push(`${track.id}[${i}]: pitch sur une piste perc`);
        if (!Number.isInteger(step.pitch)) errors.push(`${track.id}[${i}]: pitch non entier`);
        if (
          track.pitchRange &&
          (step.pitch < track.pitchRange.min || step.pitch > track.pitchRange.max)
        ) {
          errors.push(`${track.id}[${i}]: pitch ${step.pitch} hors plage`);
        }
      }
      if (step.vel !== undefined && !(step.vel >= 0 && step.vel <= 1)) {
        errors.push(`${track.id}[${i}]: vel ${step.vel} hors [0, 1]`);
      }
      if (track.kind === 'melodic' && step.on && step.pitch === undefined) {
        errors.push(`${track.id}[${i}]: pas mélodique actif sans pitch`);
      }
      if (step.gate !== undefined) {
        if (track.kind !== 'kick') errors.push(`${track.id}[${i}]: gate sur une piste ${track.kind}`);
        if (!GATE_LEVELS.includes(step.gate as (typeof GATE_LEVELS)[number])) {
          errors.push(`${track.id}[${i}]: gate ${step.gate} hors GATE_LEVELS`);
        }
      }
      if (step.bend !== undefined) {
        if (track.kind !== 'kick') errors.push(`${track.id}[${i}]: bend sur une piste ${track.kind}`);
        if (!Number.isInteger(step.bend) || Math.abs(step.bend) > BEND_RANGE) {
          errors.push(`${track.id}[${i}]: bend ${step.bend} hors [-${BEND_RANGE}, ${BEND_RANGE}]`);
        }
      }
      if (step.variant !== undefined) {
        if (track.kind !== 'kick') {
          errors.push(`${track.id}[${i}]: variant sur une piste ${track.kind}`);
        }
        if (!Number.isInteger(step.variant) || step.variant < 0 || step.variant >= KICK_VARIANTS) {
          errors.push(`${track.id}[${i}]: variant ${step.variant} hors [0, ${KICK_VARIANTS - 1}]`);
        }
      }
      if (step.len !== undefined) {
        if (track.kind !== 'melodic') {
          errors.push(`${track.id}[${i}]: len sur une piste ${track.kind}`);
        }
        if (!Number.isInteger(step.len) || step.len < 2 || i + step.len > pattern.lengthSteps) {
          errors.push(`${track.id}[${i}]: len ${step.len} invalide`);
        }
      }
      if (!(track.drive >= 0 && track.drive <= 1)) {
        // vérifié une fois par piste via le premier pas pour rester dans la boucle
        if (i === 0) errors.push(`${track.id}: drive ${track.drive} hors [0, 1]`);
      }
    });
  }

  return errors;
}
