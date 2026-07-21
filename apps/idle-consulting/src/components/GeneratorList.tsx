// Liste des générateurs achetables (tiers débloqués progressivement)

import type { GameState, GameAction } from '../game/GameState';
import { GENERATORS } from '../game/generators';
import { TIER_UNLOCK_COST_RATIO, TIER_UNLOCK_PREV_COUNT } from '../utils/constants';
import { GeneratorRow } from './GeneratorRow';

interface GeneratorListProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

function isTierUnlocked(tierId: number, state: GameState): boolean {
  // Tier 1 toujours visible
  if (tierId === 1) return true;

  const gen = GENERATORS.find(g => g.id === tierId);
  if (!gen) return false;

  // Débloqué si le joueur a 10% du coût de base
  if (state.euros >= gen.baseCost * TIER_UNLOCK_COST_RATIO) return true;

  // Ou si le joueur possède 5+ du tier précédent
  const prevGs = state.generators[tierId - 1];
  if (prevGs && prevGs.bought >= TIER_UNLOCK_PREV_COUNT) return true;

  // Ou si déjà acheté
  const gs = state.generators[tierId];
  if (gs && gs.bought > 0) return true;

  return false;
}

export function GeneratorList({ state, dispatch }: GeneratorListProps) {
  const visibleGenerators = GENERATORS.filter(g => isTierUnlocked(g.id, state));

  return (
    <div className="generator-list">
      <h2 className="panel-title">Effectifs</h2>
      <div className="generator-rows">
        {visibleGenerators.map(gen => (
          <GeneratorRow
            key={gen.id}
            gen={gen}
            state={state}
            dispatch={dispatch}
          />
        ))}
      </div>
    </div>
  );
}
