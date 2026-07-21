// State central du jeu — utilisé avec useReducer

import { GENERATORS } from './generators';
import { PRESTIGE_UPGRADES } from './prestigeUpgrades';

export interface GeneratorState {
  bought: number;    // achetés manuellement (pour le calcul du coût)
  generated: number; // générés automatiquement (fractionnaire)
}

export interface ActiveEvent {
  eventId: string;
  expiresAt: number; // timestamp ms
  // Pour l'événement chasseur de têtes
  doubledTierId?: number;
}

export interface GameState {
  // Monnaies
  euros: number;
  reputation: number;
  totalReputationEarned: number; // ⭐ gagnées all-time (bonus passif +2%/⭐)

  // Statistiques de la run en cours
  totalEurosThisRun: number;
  totalClicks: number; // all-time
  clicksThisRun: number;
  currentEps: number; // €/s calculé (pour affichage)

  // Générateurs : clé = tierId
  generators: Record<number, GeneratorState>;

  // Upgrades in-run achetées (set d'IDs)
  purchasedUpgrades: string[];

  // Prestige
  totalPrestiges: number;
  purchasedPrestigeUpgrades: string[];

  // Achievements débloqués (set d'IDs)
  unlockedAchievements: string[];

  // Événements
  activeEvents: ActiveEvent[];
  pendingEvent: string | null; // événement affiché à l'écran (à cliquer)
  pendingEventExpiresAt: number;
  nextEventAt: number; // timestamp du prochain événement
  resignationCount: number; // compteur pour l'achievement

  // Stats persistantes
  totalEurosAllTime: number;
  lastRunEps: number; // €/s du run précédent (pour Partenariat École d'Ingé)
  runStartTime: number; // timestamp du début de la run

  // Dernier timestamp de mise à jour (pour calcul offline)
  lastTickAt: number;
}

export function createInitialState(): GameState {
  const generators: Record<number, GeneratorState> = {};
  for (const gen of GENERATORS) {
    generators[gen.id] = { bought: 0, generated: 0 };
  }

  return {
    euros: 0,
    reputation: 0,
    totalReputationEarned: 0,
    totalEurosThisRun: 0,
    totalClicks: 0,
    clicksThisRun: 0,
    currentEps: 0,
    generators,
    purchasedUpgrades: [],
    totalPrestiges: 0,
    purchasedPrestigeUpgrades: [],
    unlockedAchievements: [],
    activeEvents: [],
    pendingEvent: null,
    pendingEventExpiresAt: 0,
    nextEventAt: Date.now() + 180_000, // premier événement après 3 minutes
    resignationCount: 0,
    totalEurosAllTime: 0,
    lastRunEps: 0,
    runStartTime: Date.now(),
    lastTickAt: Date.now(),
  };
}

// Applique les générateurs de départ des upgrades de prestige
export function applyStartingGenerators(state: GameState): GameState {
  const newState = { ...state, generators: { ...state.generators } };

  for (const upgradeId of state.purchasedPrestigeUpgrades) {
    const upgrade = PRESTIGE_UPGRADES.find(u => u.id === upgradeId);
    if (upgrade?.startingGenerators) {
      for (const sg of upgrade.startingGenerators) {
        const gen = { ...newState.generators[sg.tierId] };
        gen.bought += sg.count;
        newState.generators[sg.tierId] = gen;
      }
    }
  }

  return newState;
}

// Actions du reducer
export type GameAction =
  | { type: 'CLICK' }
  | { type: 'BUY_GENERATOR'; tierId: number; count: number }
  | { type: 'BUY_UPGRADE'; upgradeId: string }
  | { type: 'BUY_PRESTIGE_UPGRADE'; upgradeId: string }
  | { type: 'PRESTIGE' }
  | { type: 'TICK'; deltaMs: number; now: number }
  | { type: 'APPLY_OFFLINE'; now: number }
  | { type: 'CLICK_EVENT' }
  | { type: 'DISMISS_EVENT' }
  | { type: 'LOAD_SAVE'; state: GameState };
