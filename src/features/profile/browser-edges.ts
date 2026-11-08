/**
 * The browser edges of Perfil — the only files in this folder that name a DOM type.
 *
 * Everything the screen decides is pure and tested against injected functions
 * (`export.ts`, `device-mode.ts`, `launch-marker.ts`). This module is the other half:
 * a `Blob` download, the share sheet, the clipboard, `localStorage`, the installed
 * probe and `navigator.storage.estimate()`. None of it decides anything; each function
 * reports what the platform said, including "it did not say".
 */

import { backupBlob } from '../../storage/browser/blob';
import type { MarkerStore, LaunchMarker } from './launch-marker';
import type { UsageEstimate } from './storage-inventory';
import type { ExportEdges } from './export';
import type { InstalledProbe } from './device-mode';

/** §9 order: download, share sheet, clipboard. The answers are the platform's, not ours. */
export function exportEdges(): ExportEdges {
  return {
    download: (artifact) => {
      const url = URL.createObjectURL(backupBlob(artifact.json));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = artifact.fileName;
      anchor.rel = 'noopener';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // iOS gives no callback for "the file was saved". The URL is revoked late enough
      // that a long press on the just-created file still resolves.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return 'unknown';
    },

    share: async (artifact) => {
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: readonly File[] }) => boolean;
      };
      if (typeof nav.share !== 'function') return 'unavailable';

      const file = new File([artifact.json], artifact.fileName, { type: artifact.mimeType });
      if (typeof nav.canShare === 'function' && !nav.canShare({ files: [file] })) {
        return 'unavailable';
      }

      try {
        await nav.share({ files: [file], title: 'Rupfit' });
        return 'done';
      } catch (error) {
        // The owner closed the sheet: an answer, not a reason to try another route.
        return (error as { name?: string } | null)?.name === 'AbortError' ? 'declined' : 'unavailable';
      }
    },

    clipboard: async (artifact) => {
      const nav = navigator as Navigator & { clipboard?: { writeText(text: string): Promise<void> } };
      const clipboard = nav.clipboard;
      if (clipboard?.writeText === undefined) return 'unavailable';
      try {
        await clipboard.writeText(artifact.json);
        return 'done';
      } catch {
        return 'unavailable';
      }
    },
  };
}

/** architecture §2.1.1: two sources, treated as advisory. */
export function readInstalledProbe(): InstalledProbe {
  let displayModeStandalone = false;
  try {
    displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    displayModeStandalone = false;
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return { displayModeStandalone, navigatorStandalone: nav.standalone === true };
}

const MARKER_KEY = 'rupfit.launch';

/**
 * The launch marker in `localStorage`. It is not the store and not a domain row: it
 * only answers "was anything ever saved here" (§2.5). A missing, unreadable or
 * half-written marker is `null`, which degrades to a first run rather than to a false
 * accusation of eviction.
 */
export function createMarkerStore(): MarkerStore {
  return {
    read: () => {
      try {
        const raw = window.localStorage.getItem(MARKER_KEY);
        if (raw === null) return null;
        return parseMarker(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    write: (marker: LaunchMarker) => {
      try {
        window.localStorage.setItem(MARKER_KEY, JSON.stringify(marker));
      } catch {
        // Private mode, a full quota, a blocked storage: the marker is a courtesy, not data.
      }
    },
  };
}

function parseMarker(value: unknown): LaunchMarker | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const first = candidate['firstLaunchAt'];
  const last = candidate['lastLaunchAt'];
  const hadData = candidate['hadData'];
  const lastExportAt = candidate['lastExportAt'];

  if (typeof first !== 'number' || typeof last !== 'number' || typeof hadData !== 'boolean') {
    return null;
  }
  if (lastExportAt !== null && typeof lastExportAt !== 'number') return null;

  return { firstLaunchAt: first, lastLaunchAt: last, hadData, lastExportAt };
}

/** `navigator.storage.estimate()`, or the two nulls that mean "it did not say". */
export async function readStorageEstimate(): Promise<UsageEstimate> {
  const api = (navigator as Navigator & {
    storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
  }).storage;

  if (api?.estimate === undefined) return { usageBytes: null, quotaBytes: null };

  try {
    const estimate = await api.estimate();
    return {
      usageBytes: typeof estimate.usage === 'number' ? estimate.usage : null,
      quotaBytes: typeof estimate.quota === 'number' ? estimate.quota : null,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null };
  }
}

/** The text of the file the owner picked. A file that will not read is an empty import. */
export async function readFileText(file: File): Promise<string> {
  return file.text();
}

/**
 * A profile id. `randomUUID` is only exposed in a secure context, which GitHub Pages is;
 * the fallback takes the instant from the injected clock so this module never reads one
 * of its own.
 */
export function createProfileId(now: number): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto?.randomUUID !== undefined) return webCrypto.randomUUID();
  return `profile-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
