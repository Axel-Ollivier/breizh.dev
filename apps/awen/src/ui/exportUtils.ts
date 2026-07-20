import { audioEngine } from '../audio/AudioEngine';
import { applyPreset, serializePreset } from '../state/presets';
import { useAwenStore } from '../state/store';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

let exporting = false;

/** Export WAV (bouton et raccourci E). Ne rejette jamais, erreurs loguées. */
export async function runWavExport(): Promise<void> {
  if (exporting) return;
  exporting = true;
  try {
    const { blob, filename } = await audioEngine.exportWav(useAwenStore.getState().exportBars);
    download(blob, filename);
  } catch (error) {
    console.error('Export WAV impossible :', error);
  } finally {
    exporting = false;
  }
}

export function exportPresetFile(): void {
  const preset = serializePreset();
  const name = `awen_preset_seed${preset.seed}_${preset.bpm}bpm.json`;
  download(new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }), name);
}

export async function importPresetFile(file: File): Promise<void> {
  try {
    const error = applyPreset(JSON.parse(await file.text()));
    if (error) console.error(`Import de preset refusé : ${error}`);
  } catch (error) {
    console.error('Preset illisible :', error);
  }
}
