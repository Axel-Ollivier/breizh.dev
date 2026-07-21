// Header : €, €/s, ⭐, nom des locaux

import type { GameState } from '../game/GameState';
import { getOfficeLevel } from '../game/prestige';
import { formatNumber } from '../utils/format';

interface HeaderProps {
  state: GameState;
}

export function Header({ state }: HeaderProps) {
  const office = getOfficeLevel(state.totalPrestiges);

  return (
    <header className="game-header">
      <div className="header-office">
        <span className="office-icon">🏢</span>
        <span className="office-name">{office.name}</span>
        <span className="office-title">({office.title})</span>
      </div>
      <div className="header-stats">
        <div className="stat stat-euros">
          <span className="stat-value">{formatNumber(state.euros)}</span>
          <span className="stat-label"> €</span>
        </div>
        <div className="stat stat-eps">
          <span className="stat-value">{formatNumber(state.currentEps)}</span>
          <span className="stat-label"> €/s</span>
        </div>
        <div className="stat stat-reputation">
          <span className="stat-value">⭐ {formatNumber(state.reputation)}</span>
        </div>
      </div>
    </header>
  );
}
