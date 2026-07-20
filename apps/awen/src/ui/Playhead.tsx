import { useEffect, useRef } from 'react';

import { audioEngine } from '../audio/AudioEngine';

/**
 * Tête de lecture : overlay positionné, piloté par les callbacks `Tone.Draw`
 * du moteur. Aucun setState à la cadence audio — le style est muté via ref.
 */
export function Playhead({ lengthSteps }: { lengthSteps: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return audioEngine.subscribeStep((step) => {
      const el = ref.current;
      if (!el) return;
      if (step < 0) {
        el.style.opacity = '0';
      } else {
        el.style.opacity = '1';
        el.style.transform = `translateX(${step * 100}%)`;
      }
    });
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 rounded-sm bg-ink/15 opacity-0 ring-1 ring-moss/60 transition-none"
      style={{ width: `${100 / lengthSteps}%` }}
    />
  );
}
