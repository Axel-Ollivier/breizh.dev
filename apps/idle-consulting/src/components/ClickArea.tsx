// Bouton central de clic + animation "+X€"

import { useState, useCallback } from 'react';
import { computeClickValue } from '../game/GameLoop';
import type { GameState, GameAction } from '../game/GameState';
import { formatNumber } from '../utils/format';

interface FloatingText {
  id: number;
  value: number;
  x: number;
  y: number;
}

interface ClickAreaProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

let nextId = 0;

export function ClickArea({ state, dispatch }: ClickAreaProps) {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const clickValue = computeClickValue(state);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      dispatch({ type: 'CLICK' });

      // Animation "+X€"
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = nextId++;

      setFloatingTexts((prev) => [...prev, { id, value: clickValue, x, y }]);

      // Supprimer après l'animation
      setTimeout(() => {
        setFloatingTexts((prev) => prev.filter((ft) => ft.id !== id));
      }, 1000);
    },
    [dispatch, clickValue],
  );

  return (
    <div className="click-area">
      <div className="click-value">
        {formatNumber(clickValue)} €/clic
      </div>
      <button className="click-button" onClick={handleClick}>
        <div className="click-button-icon">💼</div>
        <div className="click-button-text">Cliquez !</div>
      </button>
      <div className="click-eps">
        {formatNumber(state.currentEps)} €/s
      </div>
      {floatingTexts.map((ft) => (
        <div
          key={ft.id}
          className="floating-text"
          style={{ left: ft.x, top: ft.y }}
        >
          +{formatNumber(ft.value)} €
        </div>
      ))}
    </div>
  );
}
