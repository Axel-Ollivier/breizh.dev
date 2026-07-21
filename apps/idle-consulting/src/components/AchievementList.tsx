// Panel des achievements

import { useState } from 'react';
import type { GameState } from '../game/GameState';
import { ACHIEVEMENTS } from '../game/achievements';

interface AchievementListProps {
  state: GameState;
}

export function AchievementList({ state }: AchievementListProps) {
  const [expanded, setExpanded] = useState(false);

  const unlocked = ACHIEVEMENTS.filter(a => state.unlockedAchievements.includes(a.id));
  const locked = ACHIEVEMENTS.filter(a => !state.unlockedAchievements.includes(a.id));

  return (
    <footer className="achievement-footer">
      <button
        className="achievement-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        🏆 Achievements : {unlocked.length}/{ACHIEVEMENTS.length}
        {unlocked.length > 0 && (
          <span className="achievement-bonus"> (+{unlocked.length}% prod)</span>
        )}
      </button>

      {expanded && (
        <div className="achievement-panel">
          {unlocked.map(a => (
            <div key={a.id} className="achievement-item unlocked" title={a.description}>
              ✅ {a.name}
            </div>
          ))}
          {locked.map(a => (
            <div key={a.id} className="achievement-item locked">
              🔒 ???
            </div>
          ))}
        </div>
      )}
    </footer>
  );
}
