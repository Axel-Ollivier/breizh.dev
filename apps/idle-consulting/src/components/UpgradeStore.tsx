// Panel des upgrades in-run (achetées en €)

import type { GameState, GameAction } from '../game/GameState';
import { ALL_UPGRADES, type UpgradeDef } from '../game/upgrades';
import { computeUpgradeCostReduction } from '../game/GameLoop';
import { formatNumber } from '../utils/format';

interface UpgradeStoreProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

function isUpgradeVisible(upg: UpgradeDef, state: GameState): boolean {
  // Déjà achetée → pas visible
  if (state.purchasedUpgrades.includes(upg.id)) return false;

  const cond = upg.condition;
  switch (cond.type) {
    case 'clicks':
      return state.totalClicks >= cond.count * 0.5; // visible à 50% de la condition
    case 'generatorCount': {
      const gs = state.generators[cond.tierId];
      return gs ? gs.bought >= cond.count * 0.5 : false;
    }
    case 'eps':
      return state.currentEps >= cond.amount * 0.5;
  }
}

function isUpgradeUnlocked(upg: UpgradeDef, state: GameState): boolean {
  const cond = upg.condition;
  switch (cond.type) {
    case 'clicks':
      return state.totalClicks >= cond.count;
    case 'generatorCount': {
      const gs = state.generators[cond.tierId];
      return gs ? gs.bought >= cond.count : false;
    }
    case 'eps':
      return state.currentEps >= cond.amount;
  }
}

export function UpgradeStore({ state, dispatch }: UpgradeStoreProps) {
  const costReduction = computeUpgradeCostReduction(state);

  const visibleUpgrades = ALL_UPGRADES.filter(upg => isUpgradeVisible(upg, state));

  if (visibleUpgrades.length === 0) return null;

  return (
    <div className="upgrade-store">
      <h2 className="panel-title">Upgrades</h2>
      <div className="upgrade-list">
        {visibleUpgrades.map(upg => {
          const unlocked = isUpgradeUnlocked(upg, state);
          const effectiveCost = Math.floor(upg.cost * (1 - costReduction));
          const canAfford = state.euros >= effectiveCost && unlocked;

          return (
            <button
              key={upg.id}
              className={`upgrade-item ${canAfford ? 'affordable' : ''} ${!unlocked ? 'locked' : ''}`}
              onClick={() => canAfford && dispatch({ type: 'BUY_UPGRADE', upgradeId: upg.id })}
              disabled={!canAfford}
              title={!unlocked ? 'Conditions non remplies' : upg.description}
            >
              <div className="upgrade-name">{upg.name}</div>
              <div className="upgrade-desc">{upg.description}</div>
              <div className="upgrade-cost">{formatNumber(effectiveCost)} €</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
