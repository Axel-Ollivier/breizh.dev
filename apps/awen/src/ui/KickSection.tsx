import { memo, useRef } from 'react';

import { audioEngine } from '../audio/AudioEngine';
import { DEFAULT_VELOCITY } from '../engine/pattern';
import { degreeLabel } from '../engine/scales';
import { useAwenStore } from '../state/store';
import { Playhead } from './Playhead';
import { StepCell } from './StepCell';
import { TrackControls } from './TrackControls';

const SLOT_LABELS = ['A', 'B', 'C'] as const;

interface KickCellProps {
  trackId: string;
  stepIndex: number;
  on: boolean;
  vel: number;
  gate: number;
  bend: number;
  variant: number;
  beatStart: boolean;
}

/**
 * Cellule de kick expressive : clic = toggle, shift = vélocité,
 * alt = durée (rolls), ctrl/cmd = variante A/B/C, molette = bend.
 * Rendu : remplissage = gate, opacité = vélocité, badges variante et bend.
 */
const KickCell = memo(function KickCell({
  trackId,
  stepIndex,
  on,
  vel,
  gate,
  bend,
  variant,
  beatStart,
}: KickCellProps) {
  return (
    <button
      type="button"
      aria-label={`Pas ${trackId} ${stepIndex + 1}`}
      aria-pressed={on}
      onClick={(e) => {
        const s = useAwenStore.getState();
        if (e.altKey) s.cycleStepGate(trackId, stepIndex);
        else if (e.ctrlKey || e.metaKey) s.cycleStepVariant(trackId, stepIndex);
        else if (e.shiftKey) s.cycleStepVelocity(trackId, stepIndex);
        else s.toggleLaneStep(trackId, stepIndex);
      }}
      onWheel={(e) => {
        if (on) useAwenStore.getState().adjustStepBend(trackId, stepIndex, e.deltaY < 0 ? 1 : -1);
      }}
      className={`relative h-8 w-full overflow-hidden rounded-[3px] border transition-colors ${
        on ? 'border-wave' : `border-ink/10 hover:border-wave/60 ${beatStart ? 'bg-ink/10' : 'bg-ink/5'}`
      }`}
    >
      {on && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-wave"
          style={{ width: `${gate * 100}%`, opacity: 0.35 + 0.65 * vel }}
        />
      )}
      {on && variant > 0 && (
        <span className="absolute left-0.5 top-0 font-mono text-[8px] font-bold leading-3 text-ink">
          {SLOT_LABELS[variant]}
        </span>
      )}
      {on && bend !== 0 && (
        <span className="absolute bottom-0 right-0.5 font-mono text-[8px] leading-3 text-ink">
          {bend > 0 ? `↗${bend}` : `↘${-bend}`}
        </span>
      )}
    </button>
  );
});

export function KickSection({ trackId = 'kick' }: { trackId?: string }) {
  const TRACK_ID = trackId;
  const track = useAwenStore((s) => s.pattern.tracks.find((t) => t.id === TRACK_ID));
  const lengthSteps = useAwenStore((s) => s.pattern.lengthSteps);
  const scale = useAwenStore((s) => s.scale);
  const kickSampleNames = useAwenStore((s) => s.kickSampleNames);
  const fileInput = useRef<HTMLInputElement>(null);
  const dropSlot = useRef(0);

  if (!track?.pitchRange) return null;
  const follows = track.followTrackId !== undefined;
  const anySample = kickSampleNames.some(Boolean);
  const { min, max } = track.pitchRange;
  const degrees: number[] = [];
  for (let d = max; d >= min; d--) degrees.push(d);

  const loadFile = (file: File | undefined, slot: number) => {
    if (file) void audioEngine.loadKickSample(file, slot);
  };

  const gridCols = { gridTemplateColumns: `repeat(${lengthSteps}, minmax(0, 1fr))` };

  return (
    <section
      aria-label="Piste kick"
      className="flex flex-col gap-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        loadFile(e.dataTransfer.files[0], dropSlot.current);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-sm font-black italic uppercase tracking-wider text-wave">
          {TRACK_ID === 'kick' ? 'Kick' : TRACK_ID}
        </h2>
        {TRACK_ID !== 'kick' && (
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
          aria-label="Instrument du kick"
          value={track.instrumentId}
          onChange={(e) => useAwenStore.getState().setTrackInstrument(TRACK_ID, e.target.value)}
          className="rounded border border-ink/20 bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-moss focus:outline-none"
        >
          <option value="kick-synth">synthé (A punch · B tight · C boom)</option>
          <option value="kick-sampler" disabled={!anySample}>
            sampler{anySample ? '' : ' (importer un sample)'}
          </option>
        </select>
        <div className="flex items-center gap-1" role="group" aria-label="Slots de samples">
          {SLOT_LABELS.map((label, slot) => (
            <button
              key={label}
              type="button"
              title={kickSampleNames[slot] ?? `Importer un sample dans le slot ${label}`}
              onClick={() => {
                dropSlot.current = slot;
                fileInput.current?.click();
              }}
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                kickSampleNames[slot]
                  ? 'border-moss/60 text-moss'
                  : 'border-dashed border-ink/30 text-ink/50 hover:border-moss hover:text-ink'
              }`}
            >
              {label}
              {kickSampleNames[slot] ? ' ●' : ' +'}
            </button>
          ))}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            loadFile(e.target.files?.[0], dropSlot.current);
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
        <div className="flex w-10 items-center justify-end pr-1">
          <span className="font-mono text-[10px] text-ink/40">kick</span>
        </div>
        <div className="relative flex-1">
          <div className="grid gap-px" style={gridCols}>
            {track.steps.map((step, i) => (
              <KickCell
                key={i}
                trackId={TRACK_ID}
                stepIndex={i}
                on={step.on}
                vel={step.on ? (step.vel ?? DEFAULT_VELOCITY) : 0}
                gate={step.on ? (step.gate ?? 1) : 0}
                bend={step.on ? (step.bend ?? 0) : 0}
                variant={step.on ? (step.variant ?? 0) : 0}
                beatStart={i % 4 === 0}
              />
            ))}
          </div>
          <Playhead lengthSteps={lengthSteps} />
        </div>
      </div>
      <p className="pl-12 text-[10px] text-ink/30">
        clic : kick — shift : vélocité — alt : durée (roll) — ctrl/cmd : variante A/B/C — molette :
        bend
      </p>

      {!follows && (
        <div className="flex gap-2">
          <div className="flex flex-col gap-px">
            {degrees.map((degree) => (
              <div
                key={degree}
                className={`flex h-4 w-10 items-center justify-end pr-1 font-mono text-[9px] leading-none ${
                  degree % 7 === 0 ? 'text-wave' : 'text-ink/40'
                }`}
              >
                {degreeLabel(scale, degree)}
              </div>
            ))}
          </div>
          <div className="relative flex-1">
            <div className="flex flex-col gap-px">
              {degrees.map((degree) => (
                <div key={degree} className="grid gap-px" style={gridCols}>
                  {track.steps.map((step, i) => {
                    const on = step.on && step.pitch === degree;
                    return (
                      <StepCell
                        key={i}
                        ariaLabel={`Pitch kick pas ${i + 1}, degré ${degree}`}
                        on={on}
                        vel={on ? (step.vel ?? DEFAULT_VELOCITY) : 0}
                        beatStart={i % 4 === 0}
                        accent="wave"
                        small
                        onActivate={() =>
                          useAwenStore.getState().clickKickPitchCell(TRACK_ID, i, degree)
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <Playhead lengthSteps={lengthSteps} />
          </div>
        </div>
      )}
      {!follows && (
        <p className="pl-12 text-[10px] text-ink/30">
          piano-roll du kick : clic = poser / déplacer / retirer la hauteur (sans hauteur, le kick
          joue la tonique)
        </p>
      )}
    </section>
  );
}
