import { memo } from 'react';

interface StepCellProps {
  ariaLabel: string;
  on: boolean;
  /** Continuation d'une note tenue démarrée en amont (rendu lié, cellule off). */
  cont?: boolean;
  /** La note démarrée ici se prolonge sur les pas suivants. */
  hasTail?: boolean;
  /** 0 quand off — garde les props stables pour la mémoïsation. */
  vel: number;
  /** Premier pas d'un temps (colonne accentuée visuellement). */
  beatStart: boolean;
  tall?: boolean;
  small?: boolean;
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
  cont = false,
  hasTail = false,
  vel,
  beatStart,
  tall = false,
  small = false,
  accent = 'moss',
  onActivate,
}: StepCellProps) {
  const onClasses =
    accent === 'moss' ? 'border-moss bg-moss' : 'border-wave bg-wave';
  const contClasses =
    accent === 'moss' ? 'border-moss/40 bg-moss/40' : 'border-wave/40 bg-wave/40';
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={on}
      onClick={(e) => onActivate(e.shiftKey)}
      className={`${tall ? 'h-8' : small ? 'h-4' : 'h-5'} w-full border transition-colors ${
        on
          ? `${hasTail ? 'rounded-l-[3px]' : 'rounded-[3px]'} ${onClasses}`
          : cont
            ? `rounded-none ${contClasses}`
            : `rounded-[3px] border-ink/10 hover:border-moss/60 ${beatStart ? 'bg-ink/10' : 'bg-ink/5'}`
      }`}
      style={on ? { opacity: 0.35 + 0.65 * vel } : undefined}
    />
  );
});
