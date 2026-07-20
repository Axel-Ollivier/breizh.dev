import { DEFAULT_VELOCITY } from '../engine/pattern';
import { degreeLabel } from '../engine/scales';
import { useAwenStore } from '../state/store';
import { Playhead } from './Playhead';
import { StepCell } from './StepCell';
import { TrackControls } from './TrackControls';

const TRACK_ID = 'melody';

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
      <div className="flex items-center gap-3">
        <h2 className="font-display text-sm font-black italic uppercase tracking-wider text-moss">
          Mélodie <span className="text-ink/40">· supersaw</span>
        </h2>
        <div className="ml-auto">
          <TrackControls trackId={TRACK_ID} />
        </div>
      </div>
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
                {track.steps.map((step, i) => {
                  const on = step.on && step.pitch === degree;
                  return (
                    <StepCell
                      key={i}
                      ariaLabel={`Pas ${i + 1}, degré ${degree}`}
                      on={on}
                      // vel stable (0) sur les cellules éteintes, sinon un
                      // changement de vélocité re-rendrait toute la colonne.
                      vel={on ? (step.vel ?? DEFAULT_VELOCITY) : 0}
                      beatStart={i % 4 === 0}
                      onActivate={(shift) => {
                        const s = useAwenStore.getState();
                        if (shift) s.cycleStepVelocity(TRACK_ID, i);
                        else s.clickMelodicCell(TRACK_ID, i, degree);
                      }}
                    />
                  );
                })}
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
