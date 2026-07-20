import { useEffect } from 'react';

import { audioEngine } from '../audio/AudioEngine';
import { useAwenStore } from '../state/store';
import { GeneratorBar } from './GeneratorBar';
import { KickSection } from './KickSection';
import { MelodicGrid } from './MelodicGrid';
import { PercLane } from './PercLane';
import { TransportBar } from './TransportBar';

export function App() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
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
          <kbd className="rounded border border-ink/20 px-1.5 py-0.5">R</kbd> seed
        </p>
      </header>

      <TransportBar />
      <GeneratorBar />
      <MelodicGrid />
      <KickSection />
      <PercLane trackId="clap" label="Clap" />
      <PercLane trackId="hats" label="Hats" />
      <PercLane trackId="ride" label="Ride" />
    </div>
  );
}
