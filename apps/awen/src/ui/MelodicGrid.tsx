import { memo } from 'react';

import { degreeLabel } from '../engine/scales';
import { useAwenStore } from '../state/store';
import { Playhead } from './Playhead';

const TRACK_ID = 'melody';

interface CellProps {
  stepIndex: number;
  degree: number;
  on: boolean;
  vel: number;
  /** Premier pas d'un temps (colonne accentuée visuellement). */
  beatStart: boolean;
}

/**
 * Cellule mémoïsée : props primitives uniquement, handlers stables via
 * getState() — la grille ne re-render que les cellules réellement modifiées.
 */
const Cell = memo(function Cell({ stepIndex, degree, on, vel, beatStart }: CellProps) {
  return (
    <button
      type="button"
      aria-label={`Pas ${stepIndex + 1}, degré ${degree}`}
      aria-pressed={on}
      onClick={(e) => {
        const { clickMelodicCell, cycleStepVelocity } = useAwenStore.getState();
        if (e.shiftKey) cycleStepVelocity(TRACK_ID, stepIndex);
        else clickMelodicCell(TRACK_ID, stepIndex, degree);
      }}
      className={`h-5 w-full rounded-[3px] border transition-colors ${
        on
          ? 'border-moss bg-moss'
          : `border-ink/10 hover:border-moss/60 ${beatStart ? 'bg-ink/10' : 'bg-ink/5'}`
      }`}
      style={on ? { opacity: 0.35 + 0.65 * vel } : undefined}
    />
  );
});

/**
 * Piste mélodique : lignes = degrés de la gamme (aigus en haut), colonnes =
 * double-croches. Snap gamme par construction (SPECS §1.2).
 */
export function MelodicGrid() {
  const track = useAwenStore((s) => s.pattern.tracks.find((t) => t.id === TRACK_ID));
  const lengthSteps = useAwenStore((s) => s.pattern.lengthSteps);
  const scale = useAwenStore((s) => s.scale);

  if (!track?.pitchRange) return null;
  const { min, max } = track.pitchRange;
  const degrees: number[] = [];
  for (let d = max; d >= min; d--) degrees.push(d);

  return (
    <section aria-label="Piste mélodique" className="flex flex-col gap-1">
      <h2 className="font-display text-sm font-black italic uppercase tracking-wider text-moss">
        Mélodie <span className="text-ink/40">· supersaw</span>
      </h2>
      <div className="flex gap-2">
        <div className="flex flex-col gap-px">
          {degrees.map((degree) => (
            <div
              key={degree}
              className={`flex h-5 w-10 items-center justify-end pr-1 font-mono text-[10px] leading-none ${
                degree % 7 === 0 ? 'text-moss' : 'text-ink/40'
              }`}
            >
              {degreeLabel(scale, degree)}
            </div>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="flex flex-col gap-px">
            {degrees.map((degree) => (
              <div
                key={degree}
                className="grid gap-px"
                style={{ gridTemplateColumns: `repeat(${lengthSteps}, minmax(0, 1fr))` }}
              >
                {track.steps.map((step, i) => (
                  <Cell
                    key={i}
                    stepIndex={i}
                    degree={degree}
                    on={step.on && step.pitch === degree}
                    vel={step.vel ?? 0.8}
                    beatStart={i % 4 === 0}
                  />
                ))}
              </div>
            ))}
          </div>
          <Playhead lengthSteps={lengthSteps} />
        </div>
      </div>
      <p className="pl-12 text-[10px] text-ink/30">
        clic : poser / déplacer / effacer — shift+clic : vélocité
      </p>
    </section>
  );
}
