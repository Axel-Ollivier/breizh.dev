import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { startPresetPersistence } from './state/presets';
import { App } from './ui/App';
import './index.css';

startPresetPersistence();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Élément #root introuvable');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
