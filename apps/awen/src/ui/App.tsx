import { useEffect, useState } from 'react';

import { audioEngine } from '../audio/AudioEngine';
import { BPM_MAX, BPM_MIN, useAwenStore } from '../state/store';

export function App() {
  const isPlaying = useAwenStore((s) => s.isPlaying);
  const bpm = useAwenStore((s) => s.bpm);
  const setBpm = useAwenStore((s) => s.setBpm);
  // Brouillon local : la valeur n'est clampée/commitée qu'au blur ou à Entrée,
  // sinon un input contrôlé clampé à la frappe rend le BPM intapable.
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);

  const commitBpm = () => {
    if (bpmDraft !== null) setBpm(Number(bpmDraft));
    setBpmDraft(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      e.preventDefault();
      void audioEngine.toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 p-8">
      <header className="text-center">
        <h1 className="font-display text-6xl font-black italic tracking-tight text-ink">
          AWEN<span className="text-moss">.</span>
        </h1>
        <p className="mt-2 text-sm uppercase tracking-[0.3em] text-ink/50">
          séquenceur hardstyle génératif
        </p>
      </header>

      <div className="flex items-center gap-6 rounded-xl border border-ink/10 bg-black/30 px-8 py-6 shadow-lg">
        <button
          type="button"
          onClick={() => void audioEngine.toggle()}
          aria-label={isPlaying ? 'Stop' : 'Play'}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl transition-colors ${
            isPlaying
              ? 'bg-moss text-surface hover:bg-moss/80'
              : 'bg-ink/10 text-ink hover:bg-ink/20'
          }`}
        >
          {isPlaying ? '■' : '▶'}
        </button>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs uppercase tracking-widest text-ink/50">BPM</span>
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
            className="w-24 rounded-md border border-ink/20 bg-surface px-3 py-2 font-mono text-xl text-wave focus:border-moss focus:outline-none"
          />
        </label>
      </div>

      <p className="text-xs text-ink/40">
        <kbd className="rounded border border-ink/20 px-1.5 py-0.5">espace</kbd> play / stop —
        phase 1 : click de vérification à la noire
      </p>
    </div>
  );
}
