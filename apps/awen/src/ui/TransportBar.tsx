import { useState } from 'react';

import { audioEngine } from '../audio/AudioEngine';
import { PATTERN_LENGTHS, type PatternLength } from '../engine/pattern';
import {
  midiToNoteName,
  SCALE_MODE_LABELS,
  SCALE_MODES,
  type ScaleMode,
} from '../engine/scales';
import { BPM_MAX, BPM_MIN, useAwenStore } from '../state/store';

/** Toniques proposées : une octave autour de F3 (rootMidi 48–59 = C3..B3). */
const ROOTS = Array.from({ length: 12 }, (_, i) => 48 + i);

export function TransportBar() {
  const isPlaying = useAwenStore((s) => s.isPlaying);
  const bpm = useAwenStore((s) => s.bpm);
  const scale = useAwenStore((s) => s.scale);
  const lengthSteps = useAwenStore((s) => s.pattern.lengthSteps);
  // Brouillon local : la valeur n'est clampée/commitée qu'au blur ou à Entrée,
  // sinon un input contrôlé clampé à la frappe rend le BPM intapable.
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);

  const commitBpm = () => {
    if (bpmDraft !== null) useAwenStore.getState().setBpm(Number(bpmDraft));
    setBpmDraft(null);
  };

  const changeLength = (length: PatternLength) => {
    const { pattern, setLengthSteps } = useAwenStore.getState();
    const truncates =
      length < pattern.lengthSteps &&
      pattern.tracks.some((t) => t.steps.slice(length).some((s) => s.on));
    if (truncates && !window.confirm(`Réduire à ${length} pas efface les pas au-delà. Continuer ?`)) {
      return;
    }
    setLengthSteps(length);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink/10 bg-black/30 px-5 py-3 shadow-lg">
      <button
        type="button"
        onClick={() => void audioEngine.toggle()}
        aria-label={isPlaying ? 'Stop' : 'Play'}
        className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition-colors ${
          isPlaying ? 'bg-moss text-surface hover:bg-moss/80' : 'bg-ink/10 text-ink hover:bg-ink/20'
        }`}
      >
        {isPlaying ? '■' : '▶'}
      </button>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-widest text-ink/50">BPM</span>
        <input
          type="number"
          min={BPM_MIN}
          max={BPM_MAX}
          value={bpmDraft ?? bpm}
          onChange={(e) => setBpmDraft(e.target.value)}
          onBlur={commitBpm}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-20 rounded-md border border-ink/20 bg-surface px-2 py-1 font-mono text-lg text-wave focus:border-moss focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-widest text-ink/50">Tonique</span>
        <select
          value={scale.rootMidi}
          onChange={(e) =>
            useAwenStore.getState().setScale({ ...scale, rootMidi: Number(e.target.value) })
          }
          className="rounded-md border border-ink/20 bg-surface px-2 py-1.5 font-mono text-sm text-ink focus:border-moss focus:outline-none"
        >
          {ROOTS.map((midi) => (
            <option key={midi} value={midi}>
              {midiToNoteName(midi)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-widest text-ink/50">Gamme</span>
        <select
          value={scale.mode}
          onChange={(e) =>
            useAwenStore.getState().setScale({ ...scale, mode: e.target.value as ScaleMode })
          }
          className="rounded-md border border-ink/20 bg-surface px-2 py-1.5 text-sm text-ink focus:border-moss focus:outline-none"
        >
          {SCALE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {SCALE_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-widest text-ink/50">Mesures</span>
        <div className="flex overflow-hidden rounded-md border border-ink/20">
          {PATTERN_LENGTHS.map((length) => (
            <button
              key={length}
              type="button"
              onClick={() => changeLength(length)}
              className={`px-2.5 py-1.5 font-mono text-sm transition-colors ${
                lengthSteps === length
                  ? 'bg-wave text-surface'
                  : 'bg-surface text-ink/60 hover:text-ink'
              }`}
            >
              {length / 16}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
