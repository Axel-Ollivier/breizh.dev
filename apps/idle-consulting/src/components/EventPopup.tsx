// Popup d'événement aléatoire

import type { GameState, GameAction } from '../game/GameState';
import { EVENTS } from '../game/events';

interface EventPopupProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function EventPopup({ state, dispatch }: EventPopupProps) {
  if (!state.pendingEvent) return null;

  const event = EVENTS.find(e => e.id === state.pendingEvent);
  if (!event) return null;

  // lastTickAt est mis à jour à chaque tick (~60fps), ce qui garde le rendu pur
  const timeLeft = Math.max(0, Math.ceil((state.pendingEventExpiresAt - state.lastTickAt) / 1000));

  return (
    <div
      className={`event-popup ${event.type}`}
      onClick={() => dispatch({ type: 'CLICK_EVENT' })}
    >
      <div className="event-icon">
        {event.type === 'positive' ? '📧' : '⚠️'}
      </div>
      <div className="event-content">
        <div className="event-name">{event.name}</div>
        <div className="event-desc">{event.description}</div>
      </div>
      <div className="event-timer">{timeLeft}s</div>
    </div>
  );
}
