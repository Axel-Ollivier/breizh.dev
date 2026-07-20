import { memo } from 'react';

interface StepCellProps {
  ariaLabel: string;
  on: boolean;
  /** 0 quand off — garde les props stables pour la mémoïsation. */
  vel: number;
  /** Premier pas d'un temps (colonne accentuée visuellement). */
  beatStart: boolean;
  tall?: boolean;
  accent?: 'moss' | 'wave';
  onActivate: (shiftKey: boolean) => void;
}

/**
 * Cellule de pas mémoïsée, partagée par toutes les lanes : props primitives
 * uniquement, handler stable fourni par le parent (via getState, pas de
 * closure sur le state React).
 */
export const StepCell = memo(function StepCell({
  ariaLabel,
  on,
  vel,
  beatStart,
  tall = false,
  accent = 'moss',
  onActivate,
}: StepCellProps) {
  const onClasses = accent === 'moss' ? 'border-moss bg-moss' : 'border-wave bg-wave';
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={on}
      onClick={(e) => onActivate(e.shiftKey)}
      className={`${tall ? 'h-8' : 'h-5'} w-full rounded-[3px] border transition-colors ${
        on
          ? onClasses
          : `border-ink/10 hover:border-moss/60 ${beatStart ? 'bg-ink/10' : 'bg-ink/5'}`
      }`}
      style={on ? { opacity: 0.35 + 0.65 * vel } : undefined}
    />
  );
});
