// UI de prestige (preview ⭐, bouton reset) et store de prestige

import { useState } from 'react';
import type { GameState, GameAction } from '../game/GameState';
import { getReputationGained, getOfficeLevel } from '../game/prestige';
import { PRESTIGE_UPGRADES } from '../game/prestigeUpgrades';
import { computeReputationMultiplier } from '../game/GameLoop';
import { formatNumber } from '../utils/format';

interface PrestigePanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function PrestigePanel({ state, dispatch }: PrestigePanelProps) {
  const [showStore, setShowStore] = useState(false);
  const repMult = computeReputationMultiplier(state);
  const repGained = getReputationGained(state.totalEurosThisRun, repMult);
  const nextOffice = getOfficeLevel(state.totalPrestiges + 1);

  const handlePrestige = () => {
    if (repGained <= 0) return;
    if (confirm(`Déménager ? Vous gagnez ${repGained} ⭐ mais perdez tout le reste. Prochains locaux : ${nextOffice.name}`)) {
      dispatch({ type: 'PRESTIGE' });
    }
  };

  const visiblePrestigeUpgrades = PRESTIGE_UPGRADES.filter(
    upg => state.totalPrestiges >= upg.requiredPrestiges &&
           !state.purchasedPrestigeUpgrades.includes(upg.id)
  );

  const boughtPrestigeUpgrades = PRESTIGE_UPGRADES.filter(
    upg => state.purchasedPrestigeUpgrades.includes(upg.id)
  );

  return (
    <div className="prestige-panel">
      <div className="prestige-main">
        <button
          className={`prestige-button ${repGained > 0 ? 'available' : ''}`}
          onClick={handlePrestige}
          disabled={repGained <= 0}
        >
          <div className="prestige-label">🏢 Déménager</div>
          <div className="prestige-gain">+{formatNumber(repGained)} ⭐</div>
          {repGained > 0 && (
            <div className="prestige-next">→ {nextOffice.name}</div>
          )}
        </button>

        <button
          className="prestige-store-toggle"
          onClick={() => setShowStore(!showStore)}
        >
          {showStore ? '✕ Fermer' : '⭐ Upgrades permanentes'}
          {state.reputation > 0 && ` (${formatNumber(state.reputation)} ⭐)`}
        </button>
      </div>

      {showStore && (
        <div className="prestige-store">
          <h3>Upgrades permanentes</h3>
          <p className="prestige-passive">
            Chaque ⭐ gagnée donne +2% de production permanente
            {state.totalReputationEarned > 0 &&
              ` — actuellement +${formatNumber(state.totalReputationEarned * 2)}%`}
          </p>

          {boughtPrestigeUpgrades.length > 0 && (
            <div className="prestige-bought">
              <h4>Achetées :</h4>
              {boughtPrestigeUpgrades.map(upg => (
                <div key={upg.id} className="prestige-upgrade-owned">
                  ✅ {upg.name} — {upg.description}
                </div>
              ))}
            </div>
          )}

          {visiblePrestigeUpgrades.length > 0 && (
            <div className="prestige-available">
              {visiblePrestigeUpgrades.map(upg => {
                const canAfford = state.reputation >= upg.cost;
                return (
                  <button
                    key={upg.id}
                    className={`prestige-upgrade-item ${canAfford ? 'affordable' : ''}`}
                    onClick={() => canAfford && dispatch({
                      type: 'BUY_PRESTIGE_UPGRADE',
                      upgradeId: upg.id,
                    })}
                    disabled={!canAfford}
                  >
                    <div className="prestige-upgrade-name">{upg.name}</div>
                    <div className="prestige-upgrade-desc">{upg.description}</div>
                    <div className="prestige-upgrade-cost">{upg.cost} ⭐</div>
                  </button>
                );
              })}
            </div>
          )}

          {visiblePrestigeUpgrades.length === 0 && boughtPrestigeUpgrades.length === 0 && (
            <p className="prestige-empty">Faites votre premier prestige pour débloquer des upgrades !</p>
          )}
        </div>
      )}
    </div>
  );
}
