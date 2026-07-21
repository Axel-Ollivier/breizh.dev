// Modale "pendant votre absence" affichée au chargement

import { formatEuros } from '../utils/format';

interface OfflinePopupProps {
  gain: number;
  seconds: number;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

export function OfflinePopup({ gain, seconds, onClose }: OfflinePopupProps) {
  return (
    <div className="offline-overlay" onClick={onClose}>
      <div className="offline-popup" onClick={e => e.stopPropagation()}>
        <div className="offline-icon">🌙</div>
        <h2>Pendant votre absence…</h2>
        <p className="offline-duration">
          Vos équipes ont facturé pendant {formatDuration(seconds)}
        </p>
        <div className="offline-gain">+{formatEuros(gain)}</div>
        <button className="offline-close" onClick={onClose}>
          Récupérer
        </button>
      </div>
    </div>
  );
}
