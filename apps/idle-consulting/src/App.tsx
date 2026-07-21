// App principal — layout 3 colonnes

import { useReducer, useState } from 'react';
import { gameReducer, applyOfflineGains } from './game/GameLoop';
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
import { OfflinePopup } from './components/OfflinePopup';
import './App.css';

interface InitResult {
  state: ReturnType<typeof createInitialState>;
  offline: { gain: number; seconds: number } | null;
}

function getInitialState(): InitResult {
  const saved = loadGame();
  if (saved) {
    // Gains hors-ligne depuis la dernière sauvegarde
    const { state, gain, seconds } = applyOfflineGains(saved, Date.now());
    return { state, offline: gain > 0 ? { gain, seconds } : null };
  }
  const initial = createInitialState();
  return { state: applyStartingGenerators(initial), offline: null };
}

function App() {
  const [init] = useState(getInitialState);
  const [state, dispatch] = useReducer(gameReducer, init.state);
  const [offlineInfo, setOfflineInfo] = useState(init.offline);

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
      {offlineInfo && (
        <OfflinePopup
          gain={offlineInfo.gain}
          seconds={offlineInfo.seconds}
          onClose={() => setOfflineInfo(null)}
        />
      )}

      <button className="reset-button" onClick={handleReset} title="Reset la sauvegarde">
        🗑️
      </button>
    </div>
  );
}

export default App;
