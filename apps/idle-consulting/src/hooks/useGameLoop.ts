// Hook du game loop — requestAnimationFrame avec delta time

import { useEffect, useRef } from 'react';
import type { GameAction } from '../game/GameState';

export function useGameLoop(dispatch: React.Dispatch<GameAction>) {
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const tick = (now: number) => {
      const deltaMs = now - lastTimeRef.current;

      // Cap le delta à 1 seconde pour éviter les gros sauts
      // (le gain offline n'est pas géré ici)
      if (deltaMs >= 16) { // ~60fps minimum
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
