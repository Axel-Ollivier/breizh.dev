import { useAwenStore } from '../state/store';
import { Playhead } from './Playhead';
import { StepCell } from './StepCell';
import { TrackControls } from './TrackControls';

const PERC_INSTRUMENTS = [
  { value: 'clap', label: 'clap' },
  { value: 'hats', label: 'hats' },
  { value: 'ride', label: 'ride' },
];

/** Lane on/off + vélocité d'une piste percussive. */
export function PercLane({ trackId, label }: { trackId: string; label?: string }) {
  const track = useAwenStore((s) => s.pattern.tracks.find((t) => t.id === trackId));
  const lengthSteps = useAwenStore((s) => s.pattern.lengthSteps);
  if (!track) return null;
  const title = label ?? trackId;
  const removable = !['clap', 'hats', 'ride'].includes(trackId);

  return (
    <section aria-label={`Piste ${title}`} className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-sm font-black italic uppercase tracking-wider text-ink/80">
          {title}
        </h2>
        <select
          aria-label={`Instrument de ${title}`}
          value={track.instrumentId}
          onChange={(e) => useAwenStore.getState().setTrackInstrument(trackId, e.target.value)}
          className="rounded border border-ink/20 bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-moss focus:outline-none"
        >
          {PERC_INSTRUMENTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {removable && (
          <button
            type="button"
            title="Supprimer cette piste"
            onClick={() => useAwenStore.getState().removeTrackAction(trackId)}
            className="rounded border border-ink/20 px-1.5 text-xs text-ink/50 hover:border-red-400 hover:text-red-300"
          >
            ✕
          </button>
        )}
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
                ariaLabel={`Pas ${title} ${i + 1}`}
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
