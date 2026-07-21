// Sauvegarde automatique toutes les 30 secondes

import { useEffect } from 'react';
import type { GameState } from '../game/GameState';
import { saveGame } from '../game/save';
import { AUTO_SAVE_INTERVAL } from '../utils/constants';

export function useAutoSave(state: GameState) {
  useEffect(() => {
    const interval = setInterval(() => {
      saveGame(state);
    }, AUTO_SAVE_INTERVAL);

    // Sauvegarde aussi quand l'utilisateur quitte la page
    const handleBeforeUnload = () => {
      saveGame(state);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state]);
}
