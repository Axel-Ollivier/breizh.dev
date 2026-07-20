import { memo, useRef } from 'react';

import { audioEngine } from '../audio/AudioEngine';
import { useAwenStore } from '../state/store';
import { Playhead } from './Playhead';
import { StepCell } from './StepCell';
import { TrackControls } from './TrackControls';

const TRACK_ID = 'kick';

interface PitchCellProps {
  stepIndex: number;
  on: boolean;
  /** Degré affiché (0 = tonique) ; ignoré quand off. */
  pitch: number;
  beatStart: boolean;
}

/** Sous-lane de pitch : molette = ±1 degré (snap gamme par construction). */
const PitchCell = memo(function PitchCell({ stepIndex, on, pitch, beatStart }: PitchCellProps) {
  return (
    <div
      role={on ? 'spinbutton' : undefined}
      aria-label={on ? `Pitch du pas kick ${stepIndex + 1}` : undefined}
      aria-valuenow={on ? pitch : undefined}
      tabIndex={on ? 0 : -1}
      onWheel={(e) => {
        if (!on) return;
        useAwenStore.getState().adjustKickPitch(TRACK_ID, stepIndex, e.deltaY < 0 ? 1 : -1);
      }}
      onKeyDown={(e) => {
        if (!on) return;
        if (e.key === 'ArrowUp') useAwenStore.getState().adjustKickPitch(TRACK_ID, stepIndex, 1);
        if (e.key === 'ArrowDown') useAwenStore.getState().adjustKickPitch(TRACK_ID, stepIndex, -1);
      }}
      className={`flex h-5 w-full select-none items-center justify-center rounded-[3px] border font-mono text-[9px] leading-none ${
        on
          ? 'cursor-ns-resize border-wave/60 bg-wave/20 text-wave'
          : `border-ink/5 text-transparent ${beatStart ? 'bg-ink/10' : 'bg-ink/5'}`
      }`}
    >
      {on ? (pitch > 0 ? `+${pitch}` : pitch) : '·'}
    </div>
  );
});

export function KickSection() {
  const track = useAwenStore((s) => s.pattern.tracks.find((t) => t.id === TRACK_ID));
  const lengthSteps = useAwenStore((s) => s.pattern.lengthSteps);
  const kickSampleName = useAwenStore((s) => s.kickSampleName);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!track) return null;
  const follows = track.followTrackId !== undefined;

  const loadFile = (file: File | undefined) => {
    if (file) void audioEngine.loadKickSample(file);
  };

  const gridCols = { gridTemplateColumns: `repeat(${lengthSteps}, minmax(0, 1fr))` };

  return (
    <section
      aria-label="Piste kick"
      className="flex flex-col gap-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        loadFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-sm font-black italic uppercase tracking-wider text-wave">
          Kick
        </h2>
        <select
          aria-label="Instrument du kick"
          value={track.instrumentId}
          onChange={(e) => useAwenStore.getState().setTrackInstrument(TRACK_ID, e.target.value)}
          className="rounded border border-ink/20 bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-moss focus:outline-none"
        >
          <option value="kick-synth">synthé</option>
          <option value="kick-sampler" disabled={!kickSampleName}>
            sampler{kickSampleName ? ` · ${kickSampleName}` : ' (importer un sample)'}
          </option>
        </select>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded border border-dashed border-ink/30 px-2 py-0.5 text-xs text-ink/60 hover:border-moss hover:text-ink"
        >
          importer un sample (ou glisser ici)
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            loadFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <label className="flex items-center gap-1.5 text-xs text-ink/70">
          <input
            type="checkbox"
            checked={follows}
            onChange={(e) =>
              useAwenStore
                .getState()
                .setKickFollow(TRACK_ID, e.target.checked ? 'melody' : undefined)
            }
            className="accent-[#2A7AAA]"
          />
          suivre la mélodie
        </label>
        <div className="ml-auto">
          <TrackControls trackId={TRACK_ID} />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex w-10 flex-col justify-center gap-px">
          <span className="text-right font-mono text-[10px] text-ink/40">kick</span>
          {!follows && <span className="text-right font-mono text-[10px] text-wave/60">pitch</span>}
        </div>
        <div className="relative flex-1">
          <div className="flex flex-col gap-px">
            <div className="grid gap-px" style={gridCols}>
              {track.steps.map((step, i) => (
                <StepCell
                  key={i}
                  ariaLabel={`Pas kick ${i + 1}`}
                  on={step.on}
                  vel={step.on ? (step.vel ?? 0.8) : 0}
                  beatStart={i % 4 === 0}
                  tall
                  accent="wave"
                  onActivate={(shift) => {
                    const s = useAwenStore.getState();
                    if (shift) s.cycleStepVelocity(TRACK_ID, i);
                    else s.toggleLaneStep(TRACK_ID, i);
                  }}
                />
              ))}
            </div>
            {!follows && (
              <div className="grid gap-px" style={gridCols}>
                {track.steps.map((step, i) => (
                  <PitchCell
                    key={i}
                    stepIndex={i}
                    on={step.on}
                    pitch={step.pitch ?? 0}
                    beatStart={i % 4 === 0}
                  />
                ))}
              </div>
            )}
          </div>
          <Playhead lengthSteps={lengthSteps} />
        </div>
      </div>
      {!follows && (
        <p className="pl-12 text-[10px] text-ink/30">
          molette (ou ↑↓) sur la ligne pitch : degré du kick — 0 = tonique
        </p>
      )}
    </section>
  );
}
