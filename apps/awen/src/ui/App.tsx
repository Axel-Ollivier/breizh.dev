import { useEffect } from 'react';

import { audioEngine } from '../audio/AudioEngine';
import { useAwenStore } from '../state/store';
import { runWavExport } from './exportUtils';
import { GeneratorBar } from './GeneratorBar';
import { KickSection } from './KickSection';
import { MelodicGrid } from './MelodicGrid';
import { PercLane } from './PercLane';
import { TransportBar } from './TransportBar';

export function App() {
  const tracks = useAwenStore((s) => s.pattern.tracks);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Ne jamais capter les chords navigateur (Cmd+R, Ctrl+G, Cmd+M…).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      // Convention DAW assumée : espace = transport partout, y compris sur un
      // bouton focus (Entrée reste disponible pour activer les boutons au clavier).
      if (e.code === 'Space') {
        e.preventDefault();
        void audioEngine.toggle();
      } else if (e.code === 'KeyG') {
        useAwenStore.getState().generateMelodyAction('replace');
      } else if (e.code === 'KeyM') {
        useAwenStore.getState().mutateAction();
      } else if (e.code === 'KeyR') {
        useAwenStore.getState().newSeed();
      } else if (e.code === 'KeyE') {
        void runWavExport();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-black italic tracking-tight text-ink">
            AWEN<span className="text-moss">.</span>
          </h1>
          <p className="text-[11px] uppercase tracking-[0.3em] text-ink/50">
            séquenceur hardstyle génératif
          </p>
        </div>
        <p className="text-xs text-ink/40">
          <kbd className="rounded border border-ink/20 px-1.5 py-0.5">espace</kbd> play ·{' '}
          <kbd className="rounded border border-ink/20 px-1.5 py-0.5">G</kbd> générer ·{' '}
          <kbd className="rounded border border-ink/20 px-1.5 py-0.5">M</kbd> mutate ·{' '}
          <kbd className="rounded border border-ink/20 px-1.5 py-0.5">R</kbd> seed ·{' '}
          <kbd className="rounded border border-ink/20 px-1.5 py-0.5">E</kbd> export
        </p>
      </header>

      <TransportBar />
      <GeneratorBar />
      {tracks.map((t) =>
        t.kind === 'melodic' ? (
          <MelodicGrid key={t.id} trackId={t.id} />
        ) : t.kind === 'kick' ? (
          <KickSection key={t.id} trackId={t.id} />
        ) : (
          <PercLane key={t.id} trackId={t.id} label={t.id} />
        ),
      )}

      <div className="flex items-center gap-2 border-t border-ink/10 pt-3">
        <span className="text-[10px] uppercase tracking-widest text-ink/50">Ajouter une piste</span>
        {(
          [
            ['melodic', '+ lead'],
            ['kick', '+ kick'],
            ['perc', '+ perc'],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => useAwenStore.getState().addTrackAction(kind)}
            className="rounded-md border border-dashed border-ink/30 px-3 py-1 text-xs text-ink/60 transition-colors hover:border-moss hover:text-ink"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
