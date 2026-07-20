import { describe, expect, it } from 'vitest';

import { deriveKickPitches } from './bassline';
import { bjorklund, euclidToTrack } from './euclid';
import { generateMelody } from './markov';
import { mutatePattern } from './mutate';
import {
  createPattern,
  toggleStep,
  validatePattern,
  type Pattern,
  type TrackDef,
} from './pattern';
import { hashSeed, mulberry32, streamRng, weightedPick } from './prng';

const defs: TrackDef[] = [
  { id: 'melody', kind: 'melodic', instrumentId: 'supersaw', pitchRange: { min: 0, max: 20 } },
  { id: 'kick', kind: 'kick', instrumentId: 'kick-synth', pitchRange: { min: -7, max: 7 } },
  { id: 'clap', kind: 'perc', instrumentId: 'clap' },
];

const make = (len: 16 | 32 = 32): Pattern => createPattern(len, defs);

describe('prng', () => {
  it('mulberry32 est déterministe et borné [0, 1)', () => {
    const a = mulberry32(4242);
    const b = mulberry32(4242);
    for (let i = 0; i < 1000; i++) {
      const va = a();
      expect(va).toBe(b());
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
    }
  });

  it('des graines ou compteurs différents divergent', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    expect(hashSeed(42, 0)).not.toBe(hashSeed(42, 1));
    expect(streamRng(42, 0)()).not.toBe(streamRng(42, 1)());
  });

  it('weightedPick respecte les poids nuls', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      expect(weightedPick(rng, [0, 1, 0])).toBe(1);
    }
    expect(() => weightedPick(rng, [0, 0])).toThrow(/positif/);
  });
});

describe('bjorklund', () => {
  it('répartit exactement pulses pas actifs', () => {
    for (const [k, n] of [
      [3, 8],
      [5, 16],
      [4, 16],
      [0, 16],
      [16, 16],
    ] as const) {
      const p = bjorklund(k, n);
      expect(p).toHaveLength(n);
      expect(p.filter(Boolean)).toHaveLength(k);
    }
  });

  it('E(3,8) est le tresillo (à rotation près)', () => {
    const p = bjorklund(3, 8);
    // espaces entre pulses : 3/3/2 dans un ordre cyclique
    const idx = p.flatMap((v, i) => (v ? [i] : []));
    const gaps = idx.map((v, j) => ((idx[(j + 1) % 3]! - v) + 8) % 8).sort();
    expect(gaps).toEqual([2, 3, 3]);
  });

  it('rejette pulses hors bornes', () => {
    expect(() => bjorklund(9, 8)).toThrow(/hors/);
    expect(() => bjorklund(-1, 8)).toThrow(/hors/);
  });

  it('euclidToTrack tuile sur tout le pattern et remplace', () => {
    let p = toggleStep(make(), 'clap', 0);
    p = euclidToTrack(p, 'clap', 2, 3);
    const clap = p.tracks[2]!;
    const on = clap.steps.flatMap((s, i) => (s.on ? [i] : []));
    expect(on).toEqual([4, 12, 20, 28]); // 2 & 4 sur chaque mesure
    expect(validatePattern(p)).toEqual([]);
  });
});

describe('generateMelody', () => {
  it('est déterministe à rng égal et respecte la plage', () => {
    const params = { character: 'euphorique', writeMode: 'replace' } as const;
    const a = generateMelody(make(), 'melody', params, streamRng(4242, 0));
    const b = generateMelody(make(), 'melody', params, streamRng(4242, 0));
    expect(a).toEqual(b);
    const melody = a.tracks[0]!;
    const notes = melody.steps.filter((s) => s.on);
    expect(notes.length).toBeGreaterThan(4);
    for (const s of notes) {
      expect(s.pitch).toBeGreaterThanOrEqual(0);
      expect(s.pitch).toBeLessThanOrEqual(20);
    }
    expect(validatePattern(a)).toEqual([]);
  });

  it('replace vide la piste, complete préserve l’existant', () => {
    const base = toggleStep(make(), 'melody', 0, 10);
    const params = { character: 'dark', writeMode: 'complete' } as const;
    const completed = generateMelody(base, 'melody', params, streamRng(1, 0));
    expect(completed.tracks[0]?.steps[0]).toMatchObject({ on: true, pitch: 10 });
    const replaced = generateMelody(base, 'melody', {
      character: 'dark',
      writeMode: 'replace',
    }, streamRng(1, 0));
    // le pas 0 ne garde le pitch 10 que par coïncidence improbable : on vérifie
    // surtout que la sortie replace ne dépend pas du contenu préalable
    expect(replaced).toEqual(
      generateMelody(make(), 'melody', { character: 'dark', writeMode: 'replace' }, streamRng(1, 0)),
    );
  });

  it('ne touche pas les autres pistes', () => {
    const base = toggleStep(make(), 'clap', 4);
    const out = generateMelody(base, 'melody', {
      character: 'erratique',
      writeMode: 'replace',
    }, streamRng(9, 3));
    expect(out.tracks[2]).toBe(base.tracks[2]);
  });
});

describe('deriveKickPitches', () => {
  const withMelodyAndKicks = (): Pattern => {
    let p = make();
    // mesure 1 dominée par le degré 2, mesure 2 par le degré 4
    p = toggleStep(p, 'melody', 0, 9); // classe 2
    p = toggleStep(p, 'melody', 4, 9);
    p = toggleStep(p, 'melody', 8, 14); // classe 0 (moins pondérée)
    p = toggleStep(p, 'melody', 16, 11); // classe 4
    p = toggleStep(p, 'melody', 20, 18); // classe 4
    for (const i of [0, 4, 8, 12, 16, 20, 24, 28]) p = toggleStep(p, 'kick', i);
    return p;
  };

  it('écrit fondamentale par mesure sur les pas actifs uniquement', () => {
    const out = deriveKickPitches(withMelodyAndKicks(), 'kick', 'melody', { useFifths: false });
    const kick = out.tracks[1]!;
    expect(kick.steps[0]?.pitch).toBe(2);
    expect(kick.steps[12]?.pitch).toBe(2);
    expect(kick.steps[16]?.pitch).toBe(-3); // classe 4 -> registre bas (4 - 7)
    expect(kick.steps[1]?.pitch).toBeUndefined(); // pas inactif : rien
    const triggersBefore = withMelodyAndKicks().tracks[1]!.steps.filter((s) => s.on).length;
    expect(kick.steps.filter((s) => s.on)).toHaveLength(triggersBefore);
  });

  it('quintes hors temps forts avec useFifths', () => {
    let p = withMelodyAndKicks();
    p = toggleStep(p, 'kick', 2);
    const out = deriveKickPitches(p, 'kick', 'melody', { useFifths: true });
    expect(out.tracks[1]?.steps[0]?.pitch).toBe(2); // temps fort : fondamentale
    expect(out.tracks[1]?.steps[2]?.pitch).toBe(-1); // quinte de 2 = classe 6 -> -1
  });

  it('mélodie vide ⟹ pattern inchangé (même référence)', () => {
    let p = make();
    p = toggleStep(p, 'kick', 0);
    expect(deriveKickPitches(p, 'kick', 'melody', { useFifths: true })).toBe(p);
  });
});

describe('mutatePattern', () => {
  const populated = (): Pattern => {
    let p = generateMelody(make(), 'melody', {
      character: 'euphorique',
      writeMode: 'replace',
    }, streamRng(4242, 0));
    for (const i of [0, 4, 8, 12, 16, 20, 24, 28]) p = toggleStep(p, 'kick', i);
    p = euclidToTrack(p, 'clap', 2, 3);
    return p;
  };

  it('est déterministe, préserve les invariants et borne la dérive de densité', () => {
    const base = populated();
    const a = mutatePattern(base, { intensity: 0.15 }, streamRng(7, 1));
    const b = mutatePattern(base, { intensity: 0.15 }, streamRng(7, 1));
    expect(a).toEqual(b);
    expect(validatePattern(a)).toEqual([]);
    for (const [t, original] of [
      [a.tracks[0]!, base.tracks[0]!],
      [a.tracks[1]!, base.tracks[1]!],
    ] as const) {
      const d0 = original.steps.filter((s) => s.on).length;
      const d1 = t.steps.filter((s) => s.on).length;
      expect(Math.abs(d1 - d0)).toBeLessThanOrEqual(Math.max(1, Math.ceil(d0 * 0.15)));
    }
  });

  it('un pattern vide reste vide', () => {
    const out = mutatePattern(make(), { intensity: 0.3 }, streamRng(3, 0));
    expect(out).toEqual(make());
  });

  it('ne touche que les pistes ciblées', () => {
    const base = populated();
    const out = mutatePattern(base, { intensity: 0.2, trackIds: ['kick'] }, streamRng(11, 0));
    expect(out.tracks[0]).toBe(base.tracks[0]);
    expect(out.tracks[2]).toBe(base.tracks[2]);
  });
});

describe('reproductibilité (invariant maître, SPECS §3.1)', () => {
  it('même seed + même séquence d’actions = même pattern', () => {
    const run = (): Pattern => {
      const seed = 313370;
      let counter = 0;
      let p = make();
      p = generateMelody(p, 'melody', {
        character: 'euphorique',
        writeMode: 'replace',
      }, streamRng(seed, counter++));
      for (const i of [0, 4, 8, 12, 16, 20, 24, 28]) p = toggleStep(p, 'kick', i);
      p = deriveKickPitches(p, 'kick', 'melody', { useFifths: true });
      p = euclidToTrack(p, 'clap', 2, 3);
      p = mutatePattern(p, { intensity: 0.1 }, streamRng(seed, counter++));
      p = mutatePattern(p, { intensity: 0.1 }, streamRng(seed, counter++));
      return p;
    };
    expect(run()).toEqual(run());
    expect(validatePattern(run())).toEqual([]);
  });
});
