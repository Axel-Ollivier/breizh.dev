import { useAwenStore } from '../state/store';
import { Playhead } from './Playhead';
import { StepCell } from './StepCell';
import { TrackControls } from './TrackControls';

/** Lane on/off + vélocité d'une piste percussive. */
export function PercLane({ trackId, label }: { trackId: string; label: string }) {
  const track = useAwenStore((s) => s.pattern.tracks.find((t) => t.id === trackId));
  const lengthSteps = useAwenStore((s) => s.pattern.lengthSteps);
  if (!track) return null;

  return (
    <section aria-label={`Piste ${label}`} className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-sm font-black italic uppercase tracking-wider text-ink/80">
          {label}
        </h2>
        <div className="ml-auto">
          <TrackControls trackId={trackId} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-10" />
        <div className="relative flex-1">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${lengthSteps}, minmax(0, 1fr))` }}
          >
            {track.steps.map((step, i) => (
              <StepCell
                key={i}
                ariaLabel={`Pas ${label} ${i + 1}`}
                on={step.on}
                vel={step.on ? (step.vel ?? 0.8) : 0}
                beatStart={i % 4 === 0}
                onActivate={(shift) => {
                  const s = useAwenStore.getState();
                  if (shift) s.cycleStepVelocity(trackId, i);
                  else s.toggleLaneStep(trackId, i);
                }}
              />
            ))}
          </div>
          <Playhead lengthSteps={lengthSteps} />
        </div>
      </div>
    </section>
  );
}
