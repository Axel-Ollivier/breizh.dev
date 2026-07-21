// Reducer principal et logique du game loop

import type { GameState, GameAction } from './GameState';
import { createInitialState, applyStartingGenerators } from './GameState';
import { GENERATORS } from './generators';
import { ALL_UPGRADES } from './upgrades';
import { PRESTIGE_UPGRADES } from './prestigeUpgrades';
import { EVENTS, pickRandomEvent } from './events';
import { ACHIEVEMENTS } from './achievements';
import { getGeneratorCost } from './formulas';
import { getReputationGained } from './prestige';
import { EVENT_MIN_INTERVAL, EVENT_MAX_INTERVAL } from '../utils/constants';

// Calcule le multiplicateur global de production
function computeGlobalMultiplier(state: GameState): number {
  let mult = 1;

  // Upgrades in-run globales
  for (const uid of state.purchasedUpgrades) {
    const upg = ALL_UPGRADES.find(u => u.id === uid);
    if (upg?.globalMultiplier) mult *= upg.globalMultiplier;
  }

  // Upgrades prestige globales
  for (const uid of state.purchasedPrestigeUpgrades) {
    const upg = PRESTIGE_UPGRADES.find(u => u.id === uid);
    if (upg?.globalMultiplier) mult *= upg.globalMultiplier;
  }

  // BM, DA, PDG
  for (const gen of GENERATORS) {
    if (gen.globalMultPerUnit) {
      const total = (state.generators[gen.id]?.bought ?? 0) + (state.generators[gen.id]?.generated ?? 0);
      mult *= 1 + total * gen.globalMultPerUnit;
    }
  }

  // Achievements : +1% par achievement
  mult *= 1 + state.unlockedAchievements.length * 0.01;

  // Événements actifs
  const now = Date.now();
  for (const ae of state.activeEvents) {
    if (ae.expiresAt > now) {
      const ev = EVENTS.find(e => e.id === ae.eventId);
      if (ev?.productionMultiplier) mult *= ev.productionMultiplier;
    }
  }

  return mult;
}

// Calcule le multiplicateur d'un tier spécifique
function computeTierMultiplier(state: GameState, tierId: number): number {
  let mult = 1;

  // Upgrades in-run de ce tier (×2 chacune)
  for (const uid of state.purchasedUpgrades) {
    const upg = ALL_UPGRADES.find(u => u.id === uid);
    if (upg?.tierTarget === tierId && upg.tierMultiplier) {
      mult *= upg.tierMultiplier;
    }
  }

  // Upgrades prestige par range de tier
  for (const uid of state.purchasedPrestigeUpgrades) {
    const upg = PRESTIGE_UPGRADES.find(u => u.id === uid);
    if (upg?.tierRangeMultiplier) {
      const { minTier, maxTier, multiplier } = upg.tierRangeMultiplier;
      if (tierId >= minTier && tierId <= maxTier) {
        mult *= multiplier;
      }
    }
  }

  // Événement chasseur de têtes
  const now = Date.now();
  for (const ae of state.activeEvents) {
    if (ae.expiresAt > now && ae.doubledTierId === tierId) {
      mult *= 2;
    }
  }

  return mult;
}

// Calcule le €/clic
function computeClickValue(state: GameState): number {
  let value = 1; // base

  // Upgrades de clic
  for (const uid of state.purchasedUpgrades) {
    const upg = ALL_UPGRADES.find(u => u.id === uid);
    if (upg?.clickMultiplier) value *= upg.clickMultiplier;
  }

  // CSE : +10% par prestige effectué
  for (const uid of state.purchasedPrestigeUpgrades) {
    const upg = PRESTIGE_UPGRADES.find(u => u.id === uid);
    if (upg?.clickMultPerPrestige) {
      value *= 1 + upg.clickMultPerPrestige * state.totalPrestiges;
    }
  }

  // Événements actifs — multiplicateur de clic
  const now = Date.now();
  for (const ae of state.activeEvents) {
    if (ae.expiresAt > now) {
      const ev = EVENTS.find(e => e.id === ae.eventId);
      if (ev?.clickMultiplier) value *= ev.clickMultiplier;
    }
  }

  return value;
}

// Calcule la réduction de coût de base des générateurs
function computeBaseCostReduction(state: GameState): number {
  let reduction = 0;
  for (const uid of state.purchasedPrestigeUpgrades) {
    const upg = PRESTIGE_UPGRADES.find(u => u.id === uid);
    if (upg?.baseCostReduction) reduction += upg.baseCostReduction;
  }
  return Math.min(reduction, 0.5); // cap à 50%
}

// Calcule la réduction de coût des upgrades in-run
function computeUpgradeCostReduction(state: GameState): number {
  let reduction = 0;
  for (const uid of state.purchasedPrestigeUpgrades) {
    const upg = PRESTIGE_UPGRADES.find(u => u.id === uid);
    if (upg?.upgradeCostReduction) reduction += upg.upgradeCostReduction;
  }
  return Math.min(reduction, 0.5);
}

// Calcule le multiplicateur pour les générateurs de générateurs
function computeGenOfGenMultiplier(state: GameState): number {
  let mult = 1;
  for (const uid of state.purchasedPrestigeUpgrades) {
    const upg = PRESTIGE_UPGRADES.find(u => u.id === uid);
    if (upg?.generatorOfGeneratorMultiplier) mult *= upg.generatorOfGeneratorMultiplier;
  }
  return mult;
}

// Calcule le multiplicateur de réputation
function computeReputationMultiplier(state: GameState): number {
  let mult = 1;
  for (const uid of state.purchasedPrestigeUpgrades) {
    const upg = PRESTIGE_UPGRADES.find(u => u.id === uid);
    if (upg?.reputationMultiplier) mult *= upg.reputationMultiplier;
  }
  return mult;
}

// Calcule le €/s total
function computeEps(state: GameState): number {
  const globalMult = computeGlobalMultiplier(state);
  let totalEps = 0;

  for (const gen of GENERATORS) {
    const gs = state.generators[gen.id];
    if (!gs) continue;
    const totalOwned = gs.bought + Math.floor(gs.generated);
    if (totalOwned <= 0) continue;
    const tierMult = computeTierMultiplier(state, gen.id);
    totalEps += gen.baseProduction * totalOwned * tierMult;
  }

  return totalEps * globalMult;
}

// Gestion du bonus de production du run précédent (Partenariat École d'Ingé)
function computeStartingProductionBonus(state: GameState): number {
  if (state.lastRunEps <= 0) return 0;

  for (const uid of state.purchasedPrestigeUpgrades) {
    const upg = PRESTIGE_UPGRADES.find(u => u.id === uid);
    if (upg?.startingProductionPercent) {
      const elapsed = Date.now() - state.runStartTime;
      if (elapsed < 60_000) { // 60 secondes
        return state.lastRunEps * upg.startingProductionPercent;
      }
    }
  }
  return 0;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'CLICK': {
      const clickValue = computeClickValue(state);
      return {
        ...state,
        euros: state.euros + clickValue,
        totalEurosThisRun: state.totalEurosThisRun + clickValue,
        totalEurosAllTime: state.totalEurosAllTime + clickValue,
        totalClicks: state.totalClicks + 1,
        clicksThisRun: state.clicksThisRun + 1,
      };
    }

    case 'BUY_GENERATOR': {
      const gen = GENERATORS.find(g => g.id === action.tierId);
      if (!gen) return state;

      const gs = state.generators[action.tierId];
      const baseCostReduction = computeBaseCostReduction(state);
      let totalCost = 0;
      for (let i = 0; i < action.count; i++) {
        totalCost += getGeneratorCost(gen.baseCost, gs.bought + i, baseCostReduction);
      }

      if (state.euros < totalCost) return state;

      return {
        ...state,
        euros: state.euros - totalCost,
        generators: {
          ...state.generators,
          [action.tierId]: {
            ...gs,
            bought: gs.bought + action.count,
          },
        },
      };
    }

    case 'BUY_UPGRADE': {
      if (state.purchasedUpgrades.includes(action.upgradeId)) return state;

      const upg = ALL_UPGRADES.find(u => u.id === action.upgradeId);
      if (!upg) return state;

      const costReduction = computeUpgradeCostReduction(state);
      const effectiveCost = Math.floor(upg.cost * (1 - costReduction));

      if (state.euros < effectiveCost) return state;

      return {
        ...state,
        euros: state.euros - effectiveCost,
        purchasedUpgrades: [...state.purchasedUpgrades, action.upgradeId],
      };
    }

    case 'BUY_PRESTIGE_UPGRADE': {
      if (state.purchasedPrestigeUpgrades.includes(action.upgradeId)) return state;

      const upg = PRESTIGE_UPGRADES.find(u => u.id === action.upgradeId);
      if (!upg) return state;
      if (state.reputation < upg.cost) return state;
      if (state.totalPrestiges < upg.requiredPrestiges) return state;

      return {
        ...state,
        reputation: state.reputation - upg.cost,
        purchasedPrestigeUpgrades: [...state.purchasedPrestigeUpgrades, action.upgradeId],
      };
    }

    case 'PRESTIGE': {
      const repGained = getReputationGained(
        state.totalEurosThisRun,
        computeReputationMultiplier(state),
      );
      if (repGained <= 0) return state;

      const lastRunEps = computeEps(state);

      // Reset l'état in-run, conserve le permanent
      const fresh = createInitialState();
      const newState: GameState = {
        ...fresh,
        reputation: state.reputation + repGained,
        totalPrestiges: state.totalPrestiges + 1,
        purchasedPrestigeUpgrades: [...state.purchasedPrestigeUpgrades],
        unlockedAchievements: [...state.unlockedAchievements],
        totalEurosAllTime: state.totalEurosAllTime,
        totalClicks: state.totalClicks,
        resignationCount: state.resignationCount,
        lastRunEps: lastRunEps,
        runStartTime: Date.now(),
        lastTickAt: Date.now(),
        nextEventAt: state.totalPrestiges >= 1
          ? Date.now() + EVENT_MIN_INTERVAL
          : Date.now() + 999_999_999, // pas d'événements avant prestige 2
      };

      // Applique les générateurs de départ (Programme Graduate, etc.)
      return applyStartingGenerators(newState);
    }

    case 'TICK': {
      const { deltaMs, now } = action;
      const deltaSec = deltaMs / 1000;

      // Calcule les €/s
      const eps = computeEps(state);
      const bonusEps = computeStartingProductionBonus(state);
      const totalEps = eps + bonusEps;
      const earned = totalEps * deltaSec;

      // Mise à jour des générateurs de générateurs
      const newGenerators = { ...state.generators };
      const genOfGenMult = computeGenOfGenMultiplier(state);

      for (const gen of GENERATORS) {
        if (!gen.producesGenerator) continue;
        const gs = state.generators[gen.id];
        const totalOwned = gs.bought + Math.floor(gs.generated);
        if (totalOwned <= 0) continue;

        const targetId = gen.producesGenerator.targetTier;
        const rate = gen.producesGenerator.rate * totalOwned * genOfGenMult;
        const targetGs = newGenerators[targetId];
        newGenerators[targetId] = {
          ...targetGs,
          generated: targetGs.generated + rate * deltaSec,
        };
      }

      // Nettoie les événements expirés
      const activeEvents = state.activeEvents.filter(ae => ae.expiresAt > now);

      // Vérifie si un nouvel événement doit apparaître
      let pendingEvent = state.pendingEvent;
      let pendingEventExpiresAt = state.pendingEventExpiresAt;
      let nextEventAt = state.nextEventAt;

      // Les événements se débloquent au prestige 2
      if (state.totalPrestiges >= 2 && now >= state.nextEventAt && !pendingEvent) {
        const event = pickRandomEvent();
        pendingEvent = event.id;
        pendingEventExpiresAt = now + 12_000; // 12s pour cliquer
        nextEventAt = now + EVENT_MIN_INTERVAL + Math.random() * (EVENT_MAX_INTERVAL - EVENT_MIN_INTERVAL);
      }

      // Si l'événement pending a expiré, l'appliquer automatiquement
      if (pendingEvent && now >= pendingEventExpiresAt) {
        const result = applyEvent(
          { ...state, generators: newGenerators, activeEvents },
          pendingEvent,
          now,
        );
        return {
          ...result,
          euros: state.euros + earned,
          totalEurosThisRun: state.totalEurosThisRun + earned,
          totalEurosAllTime: state.totalEurosAllTime + earned,
          currentEps: totalEps,
          generators: result.generators,
          pendingEvent: null,
          pendingEventExpiresAt: 0,
          nextEventAt,
          lastTickAt: now,
          // Vérifie les achievements
          unlockedAchievements: checkAchievements({
            ...result,
            euros: state.euros + earned,
            totalEurosThisRun: state.totalEurosThisRun + earned,
            currentEps: totalEps,
          }),
        };
      }

      const newState: GameState = {
        ...state,
        euros: state.euros + earned,
        totalEurosThisRun: state.totalEurosThisRun + earned,
        totalEurosAllTime: state.totalEurosAllTime + earned,
        currentEps: totalEps,
        generators: newGenerators,
        activeEvents,
        pendingEvent,
        pendingEventExpiresAt,
        nextEventAt,
        lastTickAt: now,
      };

      // Vérifie les achievements
      newState.unlockedAchievements = checkAchievements(newState);

      return newState;
    }

    case 'CLICK_EVENT': {
      if (!state.pendingEvent) return state;
      const result = applyEvent(state, state.pendingEvent, Date.now());
      return {
        ...result,
        pendingEvent: null,
        pendingEventExpiresAt: 0,
      };
    }

    case 'DISMISS_EVENT': {
      return {
        ...state,
        pendingEvent: null,
        pendingEventExpiresAt: 0,
      };
    }

    case 'LOAD_SAVE': {
      return action.state;
    }

    default:
      return state;
  }
}

// Applique un événement
function applyEvent(state: GameState, eventId: string, now: number): GameState {
  const event = EVENTS.find(e => e.id === eventId);
  if (!event) return state;

  let newState = { ...state };

  // Événement instantané : gain d'€
  if (event.instantGainPercent) {
    const gain = state.totalEurosThisRun * event.instantGainPercent;
    newState.euros += gain;
    newState.totalEurosThisRun += gain;
    newState.totalEurosAllTime += gain;
  }

  // Événement instantané : perte de générateurs
  if (event.loseGeneratorPercent) {
    newState.resignationCount = (newState.resignationCount || 0) + 1;
    const generators = { ...newState.generators };
    // Trouve le tier le plus élevé avec des générateurs
    for (let tier = 10; tier >= 1; tier--) {
      const gs = generators[tier];
      if (gs && gs.bought > 0) {
        const loss = Math.max(1, Math.floor(gs.bought * event.loseGeneratorPercent.percent));
        generators[tier] = { ...gs, bought: Math.max(0, gs.bought - loss) };
        break;
      }
    }
    newState.generators = generators;
  }

  // Événement avec durée : ajouter aux événements actifs
  if (event.effectDuration > 0) {
    const activeEvent: { eventId: string; expiresAt: number; doubledTierId?: number } = {
      eventId: event.id,
      expiresAt: now + event.effectDuration,
    };

    // Chasseur de têtes : choisir un tier aléatoire ≥ 4
    if (event.doubleRandomHighTier) {
      const highTiers = GENERATORS.filter(g => g.id >= 4);
      const owned = highTiers.filter(g => {
        const gs = state.generators[g.id];
        return gs && (gs.bought + Math.floor(gs.generated)) > 0;
      });
      if (owned.length > 0) {
        const chosen = owned[Math.floor(Math.random() * owned.length)];
        activeEvent.doubledTierId = chosen.id;
      }
    }

    newState.activeEvents = [...(newState.activeEvents || []), activeEvent];
  }

  return newState;
}

// Vérifie et débloque les achievements
function checkAchievements(state: GameState): string[] {
  const unlocked = [...state.unlockedAchievements];
  for (const ach of ACHIEVEMENTS) {
    if (!unlocked.includes(ach.id) && ach.check(state)) {
      unlocked.push(ach.id);
    }
  }
  return unlocked;
}

// Exporte les fonctions de calcul pour l'UI
export {
  computeClickValue,
  computeGlobalMultiplier,
  computeTierMultiplier,
  computeEps,
  computeBaseCostReduction,
  computeUpgradeCostReduction,
  computeReputationMultiplier,
};
