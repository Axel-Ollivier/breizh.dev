// Hook du game loop — requestAnimationFrame avec delta time

import { useEffect, useRef } from 'react';
import type { GameAction } from '../game/GameState';

export function useGameLoop(dispatch: React.Dispatch<GameAction>) {
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = (now: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = now;
      const deltaMs = now - lastTimeRef.current;

      // Onglet resté en arrière-plan (rAF suspendu) : rattrapage au taux hors-ligne
      if (deltaMs >= 60_000) {
        dispatch({ type: 'APPLY_OFFLINE', now: Date.now() });
        lastTimeRef.current = now;
      } else if (deltaMs >= 16) { // ~60fps minimum
        // Cap le delta à 1 seconde pour éviter les gros sauts
        dispatch({
          type: 'TICK',
          deltaMs: Math.min(deltaMs, 1000),
          now: Date.now(),
        });
        lastTimeRef.current = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [dispatch]);
}
