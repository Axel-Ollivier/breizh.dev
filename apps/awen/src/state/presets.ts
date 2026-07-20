import type { MelodyCharacter } from '../engine/markov';
import { validatePattern, type Pattern } from '../engine/pattern';
import type { Scale } from '../engine/scales';
import { useAwenStore } from './store';

export interface PresetV1 {
  version: 1;
  pattern: Pattern;
  bpm: number;
  scale: Scale;
  seed: number;
  character: MelodyCharacter;
  ducking: boolean;
}

const STORAGE_KEY = 'awen-preset-autosave';

export function serializePreset(): PresetV1 {
  const { pattern, bpm, scale, seed, character, ducking } = useAwenStore.getState();
  return { version: 1, pattern, bpm, scale, seed, character, ducking };
}

/**
 * Applique un preset (fichier ou localStorage). Le pattern est validé contre
 * les invariants avant application — un JSON corrompu est rejeté. Les buffers
 * de samples ne sont pas persistés : un kick sur `kick-sampler` sans sample
 * chargé rebascule sur le synthé.
 */
export function applyPreset(raw: unknown): string | null {
  const preset = raw as Partial<PresetV1> | null;
  if (!preset || preset.version !== 1 || !preset.pattern || !preset.scale) {
    return 'Preset illisible (version ou champs manquants).';
  }
  const errors = validatePattern(preset.pattern);
  if (errors.length > 0) return `Pattern invalide : ${errors[0]}`;

  const store = useAwenStore.getState();
  const buffersLoaded = store.kickSampleNames.some(Boolean);
  const pattern: Pattern = buffersLoaded
    ? preset.pattern
    : {
        ...preset.pattern,
        tracks: preset.pattern.tracks.map((t) =>
          t.kind === 'kick' && t.instrumentId === 'kick-sampler'
            ? { ...t, instrumentId: 'kick-synth' }
            : t,
        ),
      };

  store.setPattern(pattern);
  store.setBpm(preset.bpm ?? 150);
  store.setScale(preset.scale);
  store.setSeed(preset.seed ?? 4242);
  store.setCharacter(preset.character ?? 'euphorique');
  store.setDucking(preset.ducking ?? true);
  return null;
}

/** Autosave localStorage (démarré par main.tsx) : recharge puis suit les changements. */
export function startPresetPersistence(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) applyPreset(JSON.parse(raw));
  } catch (error) {
    console.warn('Autosave illisible, ignoré :', error);
  }

  let timer: number | undefined;
  useAwenStore.subscribe(
    (s) => [s.pattern, s.bpm, s.scale, s.seed, s.character, s.ducking] as const,
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializePreset()));
        } catch {
          // stockage plein/indisponible : l'autosave est best-effort
        }
      }, 500);
    },
    { equalityFn: (a, b) => a.every((v, i) => Object.is(v, b[i])) },
  );
}
