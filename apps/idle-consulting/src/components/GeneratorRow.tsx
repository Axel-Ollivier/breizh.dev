// Un tier de générateur dans la liste

import type { GameState, GameAction } from '../game/GameState';
import type { GeneratorDef } from '../game/generators';
import { getGeneratorCost } from '../game/formulas';
import { computeBaseCostReduction } from '../game/GameLoop';
import { formatNumber } from '../utils/format';

interface GeneratorRowProps {
  gen: GeneratorDef;
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function GeneratorRow({ gen, state, dispatch }: GeneratorRowProps) {
  const gs = state.generators[gen.id];
  const baseCostReduction = computeBaseCostReduction(state);
  const cost = getGeneratorCost(gen.baseCost, gs.bought, baseCostReduction);
  const canAfford = state.euros >= cost;
  const handleBuy = () => {
    if (canAfford) {
      dispatch({ type: 'BUY_GENERATOR', tierId: gen.id, count: 1 });
    }
  };

  return (
    <div className={`generator-row ${canAfford ? 'affordable' : 'expensive'}`}>
      <button
        className="generator-buy-btn"
        onClick={handleBuy}
        disabled={!canAfford}
        title={gen.flavorText}
      >
        <div className="generator-info">
          <span className="generator-name">{gen.name}</span>
          <span className="generator-cost">{formatNumber(cost)} €</span>
        </div>
        <div className="generator-details">
          <span className="generator-production">
            +{formatNumber(gen.baseProduction)}/s
          </span>
          {gen.producesGenerator && (
            <span className="generator-special">
              🔄
            </span>
          )}
          {gen.globalMultPerUnit && (
            <span className="generator-special">
              📈
            </span>
          )}
        </div>
      </button>
      <div className="generator-count">
        <span className="generator-bought">{gs.bought}</span>
        {gs.generated >= 1 && (
          <span className="generator-generated">
            (+{Math.floor(gs.generated)})
          </span>
        )}
      </div>
    </div>
  );
}
