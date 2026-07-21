// App principal — layout 3 colonnes

import { useReducer } from 'react';
import { gameReducer } from './game/GameLoop';
import { createInitialState, applyStartingGenerators } from './game/GameState';
import { loadGame, deleteSave } from './game/save';
import { useGameLoop } from './hooks/useGameLoop';
import { useAutoSave } from './hooks/useAutoSave';
import { Header } from './components/Header';
import { ClickArea } from './components/ClickArea';
import { GeneratorList } from './components/GeneratorList';
import { UpgradeStore } from './components/UpgradeStore';
import { PrestigePanel } from './components/PrestigePanel';
import { EventPopup } from './components/EventPopup';
import { AchievementList } from './components/AchievementList';
import './App.css';

function getInitialState() {
  const saved = loadGame();
  if (saved) return saved;
  const initial = createInitialState();
  return applyStartingGenerators(initial);
}

function App() {
  const [state, dispatch] = useReducer(gameReducer, null, getInitialState);

  // Game loop
  useGameLoop(dispatch);

  // Sauvegarde automatique
  useAutoSave(state);

  // Reset de la sauvegarde (debug)
  const handleReset = () => {
    if (confirm('Supprimer la sauvegarde et recommencer ?')) {
      deleteSave();
      window.location.reload();
    }
  };

  return (
    <div className={`app prestige-${Math.min(state.totalPrestiges, 10)}`}>
      <Header state={state} />

      <main className="game-main">
        <div className="panel panel-left">
          <UpgradeStore state={state} dispatch={dispatch} />
        </div>

        <div className="panel panel-center">
          <ClickArea state={state} dispatch={dispatch} />
        </div>

        <div className="panel panel-right">
          <GeneratorList state={state} dispatch={dispatch} />
          <PrestigePanel state={state} dispatch={dispatch} />
        </div>
      </main>

      <AchievementList state={state} />
      <EventPopup state={state} dispatch={dispatch} />

      <button className="reset-button" onClick={handleReset} title="Reset la sauvegarde">
        🗑️
      </button>
    </div>
  );
}

export default App;
