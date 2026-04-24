/**
 * time.ts
 *
 * Timestamp formatting helpers. Pure functions, no side effects.
 */

/**
 * "14:32:07"
 */
export function formatHMS(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * "14:32"
 */
export function formatHM(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * "2026-04-24T14:32:07.000Z" → "2026-04-24_14-32-07"
 * Safe for use in filenames.
 */
export function formatForFilename(iso: string): string {
  return iso.replace(/:/g, '-').replace(/\..+$/, '').replace('T', '_');
}

/**
 * Elapsed seconds between two ISO timestamps as "1m 42s" or "58s".
 */
export function formatElapsed(startIso: string, endIso: string): string {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (isNaN(ms) || ms < 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * Current time as ISO string.
 */
export function nowISO(): string {
  return new Date().toISOString();
}