import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { DEFAULT_VELOCITY } from '../engine/pattern';
import { degreeLabel } from '../engine/scales';
import { useAwenStore } from '../state/store';
import { Playhead } from './Playhead';
import { StepCell } from './StepCell';
import { TrackControls } from './TrackControls';

const LEADS = [
  { value: 'supersaw', label: 'supersaw' },
  { value: 'square', label: 'square lead' },
  { value: 'pluck', label: 'pluck' },
  { value: 'screech', label: 'screech' },
];

interface DragState {
  degree: number;
  startCol: number;
  moved: boolean;
  /** Capture posée au premier mouvement seulement : un clic simple doit
   * rester ciblé sur la cellule (sinon effacer/vélocité ne marchent plus). */
  captured: boolean;
}

/**
 * Piste mélodique : lignes = degrés de la gamme (aigus en haut), colonnes =
 * double-croches. Snap gamme par construction (SPECS §1.2). Drag horizontal
 * depuis une note = durée (notes tenues) ; clic sans mouvement = geste
 * habituel de la cellule.
 */
export function MelodicGrid({ trackId = 'melody' }: { trackId?: string }) {
  const TRACK_ID = trackId;
  const track = useAwenStore((s) => s.pattern.tracks.find((t) => t.id === TRACK_ID));
  const lengthSteps = useAwenStore((s) => s.pattern.lengthSteps);
  const scale = useAwenStore((s) => s.scale);
  const ducking = useAwenStore((s) => s.ducking);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  if (!track?.pitchRange) return null;
  const { min, max } = track.pitchRange;
  const degrees: number[] = [];
  for (let d = max; d >= min; d--) degrees.push(d);

  const colFromEvent = (e: ReactPointerEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(lengthSteps - 1, Math.floor(ratio * lengthSteps)));
  };

  const onRowPointerDown = (degree: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    const col = colFromEvent(e);
    const step = track.steps[col];
    if (step?.on && step.pitch === degree) {
      drag.current = { degree, startCol: col, moved: false, captured: false };
    }
  };

  const onRowPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || e.buttons === 0) return;
    const col = colFromEvent(e);
    if (col !== state.startCol && !state.captured) {
      state.captured = true;
      state.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!state.moved) return;
    const len = Math.max(1, col - state.startCol + 1);
    const current = track.steps[state.startCol]?.len ?? 1;
    if (len !== current) {
      useAwenStore.getState().setStepLength(TRACK_ID, state.startCol, len);
    }
  };

  const onRowPointerUp = () => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
  };

  const onRowPointerCancel = () => {
    // Pas de clic à venir après un cancel : ne pas armer la suppression.
    drag.current = null;
  };

  // Continuations des notes tenues, précalculées une fois par rendu.
  const contByStep = new Array<number | null>(lengthSteps).fill(null);
  track.steps.forEach((step, i) => {
    if (step.on && step.pitch !== undefined && (step.len ?? 1) > 1) {
      for (let j = i + 1; j < Math.min(i + step.len!, lengthSteps); j++) {
        contByStep[j] = step.pitch;
      }
    }
  });

  return (
    <section aria-label="Piste mélodique" className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-sm font-black italic uppercase tracking-wider text-moss">
          {TRACK_ID === 'melody' ? 'Mélodie' : TRACK_ID}
        </h2>
        {TRACK_ID !== 'melody' && (
          <button
            type="button"
            title="Supprimer cette piste"
            onClick={() => useAwenStore.getState().removeTrackAction(TRACK_ID)}
            className="rounded border border-ink/20 px-1.5 text-xs text-ink/50 hover:border-red-400 hover:text-red-300"
          >
            ✕
          </button>
        )}
        <select
          aria-label="Instrument de la mélodie"
          value={track.instrumentId}
          onChange={(e) => useAwenStore.getState().setTrackInstrument(TRACK_ID, e.target.value)}
          className="rounded border border-ink/20 bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-moss focus:outline-none"
        >
          {LEADS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink/70" title="Le lead plonge à chaque kick">
          <input
            type="checkbox"
            checked={ducking}
            onChange={(e) => useAwenStore.getState().setDucking(e.target.checked)}
            className="accent-[#2A9B77]"
          />
          ducking
        </label>
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
        <div
          className="relative flex-1"
          onClickCapture={(e) => {
            if (suppressClick.current) {
              suppressClick.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="flex flex-col gap-px">
            {degrees.map((degree) => (
              <div
                key={degree}
                className="grid touch-none gap-px"
                style={{ gridTemplateColumns: `repeat(${lengthSteps}, minmax(0, 1fr))` }}
                onPointerDown={onRowPointerDown(degree)}
                onPointerMove={onRowPointerMove}
                onPointerUp={onRowPointerUp}
                onPointerCancel={onRowPointerCancel}
              >
                {track.steps.map((step, i) => {
                  const on = step.on && step.pitch === degree;
                  return (
                    <StepCell
                      key={i}
                      ariaLabel={`Pas ${i + 1}, degré ${degree}`}
                      on={on}
                      cont={!on && contByStep[i] === degree}
                      hasTail={on && (step.len ?? 1) > 1}
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
        clic : poser / déplacer / effacer — shift+clic : vélocité — drag depuis une note : durée
      </p>
    </section>
  );
}
