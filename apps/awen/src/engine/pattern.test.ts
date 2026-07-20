import { describe, expect, it } from 'vitest';

import {
  clearTrack,
  createPattern,
  resizePattern,
  resolveKickPitch,
  setStepPitch,
  setStepVelocity,
  setTrackFollow,
  setTrackSend,
  setTrackVolume,
  toggleStep,
  validatePattern,
  type Pattern,
  type TrackDef,
} from './pattern';

const defs: TrackDef[] = [
  { id: 'melody', kind: 'melodic', instrumentId: 'supersaw', pitchRange: { min: 0, max: 20 } },
  { id: 'kick', kind: 'kick', instrumentId: 'kick-synth', pitchRange: { min: -7, max: 13 } },
  { id: 'clap', kind: 'perc', instrumentId: 'clap' },
];

const make = (): Pattern => createPattern(16, defs);

describe('createPattern', () => {
  it('crée des pistes vides à la bonne longueur, valides', () => {
    const p = make();
    expect(p.lengthSteps).toBe(16);
    expect(p.tracks).toHaveLength(3);
    for (const t of p.tracks) {
      expect(t.steps).toHaveLength(16);
      expect(t.steps.every((s) => !s.on)).toBe(true);
      expect(t.volume).toBe(0);
      expect(t.mute).toBe(false);
      expect(t.solo).toBe(false);
      expect(t.sendFx).toBe(0);
    }
    expect(validatePattern(p)).toEqual([]);
  });

  it('rejette les ids dupliqués', () => {
    expect(() =>
      createPattern(16, [
        { id: 'a', kind: 'perc', instrumentId: 'clap' },
        { id: 'a', kind: 'perc', instrumentId: 'hat' },
      ]),
    ).toThrow(/uniques/);
  });
});

describe('toggleStep', () => {
  it('active puis désactive un pas perc', () => {
    let p = toggleStep(make(), 'clap', 4);
    expect(p.tracks[2]?.steps[4]).toEqual({ on: true });
    p = toggleStep(p, 'clap', 4);
    expect(p.tracks[2]?.steps[4]).toEqual({ on: false });
  });

  it('exige un pitch pour activer un pas mélodique', () => {
    expect(() => toggleStep(make(), 'melody', 0)).toThrow(/pitch requis/);
    const p = toggleStep(make(), 'melody', 0, 7);
    expect(p.tracks[0]?.steps[0]).toEqual({ on: true, pitch: 7 });
  });

  it('accepte un kick avec ou sans pitch', () => {
    const p = toggleStep(toggleStep(make(), 'kick', 0), 'kick', 4, 5);
    expect(p.tracks[1]?.steps[0]).toEqual({ on: true });
    expect(p.tracks[1]?.steps[4]).toEqual({ on: true, pitch: 5 });
  });

  it('clampe le pitch dans la plage de la piste et arrondit', () => {
    const p = toggleStep(toggleStep(make(), 'melody', 0, 99), 'melody', 1, 3.4);
    expect(p.tracks[0]?.steps[0]?.pitch).toBe(20);
    expect(p.tracks[0]?.steps[1]?.pitch).toBe(3);
  });

  it('efface pitch et vélocité à la désactivation', () => {
    let p = toggleStep(make(), 'melody', 0, 7);
    p = setStepVelocity(p, 'melody', 0, 0.5);
    p = toggleStep(p, 'melody', 0);
    expect(p.tracks[0]?.steps[0]).toEqual({ on: false });
  });

  it('ignore le pitch sur une piste perc', () => {
    const p = toggleStep(make(), 'clap', 0, 7);
    expect(p.tracks[2]?.steps[0]).toEqual({ on: true });
  });

  it('rejette piste inconnue et pas hors grille', () => {
    expect(() => toggleStep(make(), 'nope', 0)).toThrow(/inconnue/);
    expect(() => toggleStep(make(), 'clap', 16)).toThrow(/hors grille/);
    expect(() => toggleStep(make(), 'clap', -1)).toThrow(/hors grille/);
  });

  it('ne mute pas le pattern d’origine', () => {
    const p = make();
    toggleStep(p, 'clap', 0);
    expect(p.tracks[2]?.steps[0]).toEqual({ on: false });
  });
});

describe('setStepVelocity / setStepPitch', () => {
  it('clampe la vélocité dans [0, 1]', () => {
    let p = setStepVelocity(make(), 'clap', 0, 1.5);
    expect(p.tracks[2]?.steps[0]?.vel).toBe(1);
    p = setStepVelocity(p, 'clap', 0, -1);
    expect(p.tracks[2]?.steps[0]?.vel).toBe(0);
  });

  it('refuse le pitch sur une piste perc', () => {
    expect(() => setStepPitch(make(), 'clap', 0, 3)).toThrow(/perc/);
  });

  it('rejette les valeurs non finies (NaN, Infinity)', () => {
    expect(() => setStepVelocity(make(), 'clap', 0, NaN)).toThrow(/non finie/);
    expect(() => setStepPitch(make(), 'melody', 0, NaN)).toThrow(/non fini/);
    expect(() => setStepPitch(make(), 'kick', 0, Infinity)).toThrow(/non fini/);
    expect(() => toggleStep(make(), 'melody', 0, NaN)).toThrow(/non fini/);
  });

  it('pose le pitch clampé sur kick et melodic', () => {
    let p = setStepPitch(make(), 'kick', 0, -20);
    expect(p.tracks[1]?.steps[0]?.pitch).toBe(-7);
    p = setStepPitch(p, 'melody', 2, 12);
    expect(p.tracks[0]?.steps[2]?.pitch).toBe(12);
  });
});

describe('resizePattern', () => {
  it('étend avec des pas off', () => {
    const p = resizePattern(toggleStep(make(), 'clap', 15), 32);
    expect(validatePattern(p)).toEqual([]);
    expect(p.lengthSteps).toBe(32);
    expect(p.tracks[2]?.steps[15]?.on).toBe(true);
    expect(p.tracks[2]?.steps.slice(16).every((s) => !s.on)).toBe(true);
  });

  it('tronque à la réduction', () => {
    let p = resizePattern(make(), 64);
    p = toggleStep(p, 'clap', 40);
    p = resizePattern(p, 16);
    expect(validatePattern(p)).toEqual([]);
    expect(p.tracks[2]?.steps).toHaveLength(16);
  });

  it('est un no-op à longueur égale', () => {
    const p = make();
    expect(resizePattern(p, 16)).toBe(p);
  });
});

describe('clearTrack', () => {
  it('vide la piste ciblée uniquement', () => {
    let p = toggleStep(make(), 'clap', 0);
    p = toggleStep(p, 'melody', 0, 5);
    p = clearTrack(p, 'clap');
    expect(p.tracks[2]?.steps.every((s) => !s.on)).toBe(true);
    expect(p.tracks[0]?.steps[0]?.on).toBe(true);
  });
});

describe('setTrackFollow / mixage', () => {
  it('pose et retire le suivi kick -> mélodie', () => {
    let p = setTrackFollow(make(), 'kick', 'melody');
    expect(p.tracks[1]?.followTrackId).toBe('melody');
    expect(validatePattern(p)).toEqual([]);
    p = setTrackFollow(p, 'kick', undefined);
    expect(p.tracks[1]?.followTrackId).toBeUndefined();
  });

  it('rejette une cible non mélodique, inconnue, ou une piste non kick', () => {
    expect(() => setTrackFollow(make(), 'kick', 'clap')).toThrow(/mélodique/);
    expect(() => setTrackFollow(make(), 'kick', 'nope')).toThrow(/inconnue/);
    expect(() => setTrackFollow(make(), 'clap', 'melody')).toThrow(/kick/);
  });

  it('clampe volume et send, rejette les non-finis', () => {
    let p = setTrackVolume(make(), 'clap', -120);
    expect(p.tracks[2]?.volume).toBe(-60);
    p = setTrackSend(p, 'clap', 1.8);
    expect(p.tracks[2]?.sendFx).toBe(1);
    expect(() => setTrackVolume(p, 'clap', NaN)).toThrow(/non fini/);
    expect(() => setTrackSend(p, 'clap', NaN)).toThrow(/non fini/);
  });
});

describe('resolveKickPitch', () => {
  const withMelody = (): Pattern => {
    let p = setTrackFollow(make(), 'kick', 'melody');
    p = toggleStep(p, 'melody', 0, 7); // tonique octave
    p = toggleStep(p, 'melody', 4, 10);
    p = toggleStep(p, 'kick', 0);
    p = toggleStep(p, 'kick', 2);
    p = toggleStep(p, 'kick', 6);
    return p;
  };

  it('reprend la dernière note démarrée dans la mesure', () => {
    const p = withMelody();
    const kick = p.tracks[1]!;
    expect(resolveKickPitch(p, kick, 0)).toBe(7);
    expect(resolveKickPitch(p, kick, 2)).toBe(7);
    expect(resolveKickPitch(p, kick, 6)).toBe(10);
  });

  it('retombe sur la tonique sans note en amont dans la mesure', () => {
    let p = setTrackFollow(resizePattern(make(), 32), 'kick', 'melody');
    p = toggleStep(p, 'melody', 20, 12); // note dans la 2e mesure seulement
    const kick = p.tracks[1]!;
    expect(resolveKickPitch(p, kick, 2)).toBe(0);
    expect(resolveKickPitch(p, kick, 18)).toBe(0); // avant la note de sa mesure
    expect(resolveKickPitch(p, kick, 22)).toBe(12);
  });

  it('le pitch propre du pas prime sur le suivi', () => {
    let p = withMelody();
    p = setStepPitch(p, 'kick', 2, -3);
    expect(resolveKickPitch(p, p.tracks[1]!, 2)).toBe(-3);
  });

  it('sans pitch ni suivi : undefined (hauteur native)', () => {
    const p = toggleStep(make(), 'kick', 0);
    expect(resolveKickPitch(p, p.tracks[1]!, 0)).toBeUndefined();
  });
});

describe('validatePattern', () => {
  it('détecte les violations d’invariants', () => {
    const p = make();
    const broken: Pattern = {
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === 'clap'
          ? { ...t, steps: t.steps.map((s, i) => (i === 0 ? { on: true, pitch: 3 } : s)) }
          : t.id === 'kick'
            ? { ...t, followTrackId: 'clap' }
            : t,
      ),
    };
    const errors = validatePattern(broken);
    expect(errors.some((e) => e.includes('pitch sur une piste perc'))).toBe(true);
    expect(errors.some((e) => e.includes('followTrackId'))).toBe(true);
  });

  it('détecte une vélocité NaN (comparaison NaN-safe)', () => {
    const p = make();
    const broken: Pattern = {
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === 'clap'
          ? { ...t, steps: t.steps.map((s, i) => (i === 0 ? { on: true, vel: NaN } : s)) }
          : t,
      ),
    };
    expect(validatePattern(broken).some((e) => e.includes('hors [0, 1]'))).toBe(true);
  });

  it('accepte un followTrackId de kick vers une piste mélodique', () => {
    const p = make();
    const followed: Pattern = {
      ...p,
      tracks: p.tracks.map((t) => (t.id === 'kick' ? { ...t, followTrackId: 'melody' } : t)),
    };
    expect(validatePattern(followed)).toEqual([]);
  });
});
