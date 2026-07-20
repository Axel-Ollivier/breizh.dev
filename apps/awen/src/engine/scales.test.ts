import { describe, expect, it } from 'vitest';

import { DEFAULT_SCALE, degreeLabel, degreeToMidi, midiToNoteName, type Scale } from './scales';

const fMinor: Scale = { rootMidi: 53, mode: 'minorNatural' };
const fHarmonic: Scale = { rootMidi: 53, mode: 'minorHarmonic' };

describe('degreeToMidi', () => {
  it('mappe les degrés de la mineure naturelle', () => {
    // F mineur naturel : F G Ab Bb C Db Eb
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => degreeToMidi(fMinor, d))).toEqual([
      53, 55, 56, 58, 60, 61, 63,
    ]);
  });

  it('monte et descend par octaves', () => {
    expect(degreeToMidi(fMinor, 7)).toBe(65); // F4
    expect(degreeToMidi(fMinor, 14)).toBe(77); // F5
    expect(degreeToMidi(fMinor, -7)).toBe(41); // F2
    expect(degreeToMidi(fMinor, -1)).toBe(51); // Eb3, degré 6 une octave dessous
  });

  it('distingue la sensible de la mineure harmonique', () => {
    expect(degreeToMidi(fMinor, 6)).toBe(63); // Eb
    expect(degreeToMidi(fHarmonic, 6)).toBe(64); // E natural (sensible)
    expect(degreeToMidi(fHarmonic, -1)).toBe(52); // E2... sensible sous la tonique
  });

  it('rejette les degrés non entiers', () => {
    expect(() => degreeToMidi(fMinor, 1.5)).toThrow(/entier/);
    expect(() => degreeToMidi(fMinor, NaN)).toThrow(/entier/);
  });
});

describe('midiToNoteName / degreeLabel', () => {
  it('nomme les notes avec la convention C4 = 60', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(53)).toBe('F3');
    expect(midiToNoteName(56)).toBe('G#3');
  });

  it('labelle les lignes de la grille', () => {
    expect(degreeLabel(fMinor, 0)).toBe('F3');
    expect(degreeLabel(fMinor, 7)).toBe('F4');
    expect(degreeLabel(fMinor, 4)).toBe('C4');
  });
});

describe('DEFAULT_SCALE', () => {
  it('est F mineur naturelle', () => {
    expect(degreeLabel(DEFAULT_SCALE, 0)).toBe('F3');
    expect(DEFAULT_SCALE.mode).toBe('minorNatural');
  });
});
