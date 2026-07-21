// Sauvegarde et chargement depuis localStorage

import type { GameState } from './GameState';
import { createInitialState } from './GameState';
import { SAVE_KEY } from '../utils/constants';

export function saveGame(state: GameState): void {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(SAVE_KEY, json);
  } catch {
    // Silently fail si localStorage plein
  }
}

export function loadGame(): GameState | null {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return null;

    const saved = JSON.parse(json) as Partial<GameState>;
    // Merge avec l'état initial pour ajouter les nouveaux champs
    const initial = createInitialState();
    return {
      ...initial,
      ...saved,
      generators: {
        ...initial.generators,
        ...(saved.generators ?? {}),
      },
    };
  } catch {
    return null;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
