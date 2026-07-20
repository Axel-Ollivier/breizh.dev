import { useRef, useState } from 'react';

import type { MelodyCharacter } from '../engine/markov';
import { useAwenStore } from '../state/store';
import { exportPresetFile, importPresetFile, runWavExport } from './exportUtils';

const CHARACTERS: Array<{ value: MelodyCharacter; label: string }> = [
  { value: 'euphorique', label: 'euphorique' },
  { value: 'dark', label: 'dark' },
  { value: 'erratique', label: 'erratique' },
];

const buttonClass =
  'rounded-md border border-ink/20 px-3 py-1.5 text-xs uppercase tracking-wider text-ink/80 transition-colors hover:border-moss hover:text-ink';

/** Générateurs seedés : la grille reste éditable après chaque action. */
export function GeneratorBar() {
  const seed = useAwenStore((s) => s.seed);
  const character = useAwenStore((s) => s.character);
  const exportBars = useAwenStore((s) => s.exportBars);
  // Brouillon local pour la même raison que le BPM : commit au blur/Entrée.
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const presetInput = useRef<HTMLInputElement>(null);

  // `force` (Entrée) : re-commiter un seed identique remet quand même le
  // compteur d'actions à zéro — « repartir de ce seed ».
  const commitSeed = (force = false) => {
    if (seedDraft !== null || force) {
      useAwenStore.getState().setSeed(Number(seedDraft ?? String(seed)));
    }
    setSeedDraft(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-black/30 px-5 py-3 shadow-lg">
      <span className="font-display text-sm font-black italic uppercase tracking-wider text-moss">
        Générateurs
      </span>

      <label className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-ink/50">Seed</span>
        <input
          type="text"
          inputMode="numeric"
          value={seedDraft ?? String(seed)}
          onChange={(e) => setSeedDraft(e.target.value)}
          onBlur={() => commitSeed()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitSeed(true);
              e.currentTarget.blur();
            }
          }}
          className="w-28 rounded-md border border-ink/20 bg-surface px-2 py-1 font-mono text-sm text-wave focus:border-moss focus:outline-none"
        />
      </label>
      <button
        type="button"
        title="Nouveau seed (R)"
        onClick={() => useAwenStore.getState().newSeed()}
        className={buttonClass}
      >
        ↻ seed
      </button>

      <select
        aria-label="Caractère de la mélodie"
        value={character}
        onChange={(e) => useAwenStore.getState().setCharacter(e.target.value as MelodyCharacter)}
        className="rounded-md border border-ink/20 bg-surface px-2 py-1.5 text-xs text-ink focus:border-moss focus:outline-none"
      >
        {CHARACTERS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        title="Générer la mélodie (G) — remplace la piste"
        onClick={() => useAwenStore.getState().generateMelodyAction('replace')}
        className={`${buttonClass} border-moss/50 text-moss`}
      >
        Générer
      </button>
      <button
        type="button"
        title="Compléter la mélodie — n'écrit que sur les pas vides"
        onClick={() => useAwenStore.getState().generateMelodyAction('complete')}
        className={buttonClass}
      >
        Compléter
      </button>
      <button
        type="button"
        title="Écrit les pitchs des kicks actifs depuis la mélodie (fondamentales/quintes)"
        onClick={() => useAwenStore.getState().deriveBasslineAction()}
        className={`${buttonClass} border-wave/50 text-wave`}
      >
        Bassline → kicks
      </button>
      <button
        type="button"
        title="Percus euclidiennes : clap 2&4, hats, ride offbeat"
        onClick={() => useAwenStore.getState().euclidPercsAction()}
        className={buttonClass}
      >
        Euclide percus
      </button>
      <button
        type="button"
        title="Perturbation contrôlée du pattern (M)"
        onClick={() => useAwenStore.getState().mutateAction()}
        className={buttonClass}
      >
        Mutate
      </button>
      <button
        type="button"
        title="Automate cellulaire (règle 90) → mélodie, esprit Kosmische"
        onClick={() => useAwenStore.getState().automatonAction()}
        className={buttonClass}
      >
        Automate
      </button>

      <span className="mx-1 h-6 w-px bg-ink/10" aria-hidden />

      <label className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-ink/50">Export</span>
        <select
          aria-label="Longueur d'export"
          value={exportBars}
          onChange={(e) => useAwenStore.getState().setExportBars(Number(e.target.value) as 4 | 8 | 16)}
          className="rounded-md border border-ink/20 bg-surface px-1.5 py-1 font-mono text-xs text-ink focus:border-moss focus:outline-none"
        >
          {[4, 8, 16].map((bars) => (
            <option key={bars} value={bars}>
              {bars} mesures
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        title="Rendu WAV offline calé sur la barre (E)"
        disabled={exporting}
        onClick={() => {
          setExporting(true);
          void runWavExport().finally(() => setExporting(false));
        }}
        className={`${buttonClass} border-moss/50 text-moss disabled:opacity-40`}
      >
        {exporting ? 'rendu…' : 'WAV'}
      </button>
      <button
        type="button"
        title="Exporter le preset (pattern + params) en JSON"
        onClick={exportPresetFile}
        className={buttonClass}
      >
        Preset ↓
      </button>
      <button
        type="button"
        title="Importer un preset JSON"
        onClick={() => presetInput.current?.click()}
        className={buttonClass}
      >
        Preset ↑
      </button>
      <input
        ref={presetInput}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importPresetFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
