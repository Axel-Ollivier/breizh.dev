import { useAwenStore } from '../state/store';

/** Mute/solo/volume/send d'une piste — lit le store, écrit via les actions. */
export function TrackControls({ trackId }: { trackId: string }) {
  const track = useAwenStore((s) => s.pattern.tracks.find((t) => t.id === trackId));
  if (!track) return null;
  const { setTrackMute, setTrackSolo, setTrackVolume, setTrackSend } = useAwenStore.getState();

  const toggleClass = (active: boolean, color: string) =>
    `h-6 w-6 rounded border text-[10px] font-bold transition-colors ${
      active ? `${color} text-surface` : 'border-ink/20 text-ink/50 hover:text-ink'
    }`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title="Mute"
        aria-pressed={track.mute}
        onClick={() => setTrackMute(trackId, !track.mute)}
        className={toggleClass(track.mute, 'border-wave bg-wave')}
      >
        M
      </button>
      <button
        type="button"
        title="Solo"
        aria-pressed={track.solo}
        onClick={() => setTrackSolo(trackId, !track.solo)}
        className={toggleClass(track.solo, 'border-moss bg-moss')}
      >
        S
      </button>
      <label className="flex items-center gap-1" title={`Volume : ${track.volume} dB`}>
        <span className="text-[9px] uppercase text-ink/40">vol</span>
        <input
          type="range"
          min={-60}
          max={6}
          step={1}
          value={track.volume}
          onChange={(e) => setTrackVolume(trackId, e.target.valueAsNumber)}
          className="h-1 w-20 accent-[#2A9B77]"
        />
      </label>
      <label className="flex items-center gap-1" title={`Send FX : ${Math.round(track.sendFx * 100)} %`}>
        <span className="text-[9px] uppercase text-ink/40">fx</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={track.sendFx}
          onChange={(e) => setTrackSend(trackId, e.target.valueAsNumber)}
          className="h-1 w-16 accent-[#2A7AAA]"
        />
      </label>
    </div>
  );
}
