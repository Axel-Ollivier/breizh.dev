// Sauvegarde et chargement depuis localStorage

import type { GameState } from './GameState';
import { createInitialState } from './GameState';
import { PRESTIGE_UPGRADES } from './prestigeUpgrades';
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
    const state: GameState = {
      ...initial,
      ...saved,
      generators: {
        ...initial.generators,
        ...(saved.generators ?? {}),
      },
    };

    // Migration : reconstitue les ⭐ gagnées all-time pour les vieilles saves
    // (solde actuel + coût des upgrades de prestige déjà achetées)
    if (saved.totalReputationEarned === undefined) {
      const spent = (saved.purchasedPrestigeUpgrades ?? []).reduce((sum, id) => {
        const upg = PRESTIGE_UPGRADES.find(u => u.id === id);
        return sum + (upg?.cost ?? 0);
      }, 0);
      state.totalReputationEarned = (saved.reputation ?? 0) + spent;
    }

    return state;
  } catch {
    return null;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
