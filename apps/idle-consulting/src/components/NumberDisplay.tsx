// Composant de formatage des grands nombres

import { formatNumber, formatEuros } from '../utils/format';

interface NumberDisplayProps {
  value: number;
  suffix?: string;
  isEuros?: boolean;
}

export function NumberDisplay({ value, suffix, isEuros }: NumberDisplayProps) {
  const formatted = isEuros ? formatEuros(value) : formatNumber(value);
  return (
    <span className="number-display">
      {formatted}
      {suffix && <span className="number-suffix">{suffix}</span>}
    </span>
  );
}
