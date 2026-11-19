export interface TimezoneOption {
  value: string;
  label: string;
}

export const COMMON_TIMEZONES: TimezoneOption[] = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST, UTC+05:30)' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
  { value: 'America/Chicago', label: 'America/Chicago (CT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PT)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
];

export function isValidTimeZone(tz?: string | null): tz is string {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function detectBrowserTimezone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(resolved) ? resolved : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function parseUtcTimestamp(iso?: string | null): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  // Normalize naive ISO strings without timezone offset as UTC
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = hasOffset ? trimmed : `${trimmed}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatInTimezone(
  iso?: string | null,
  timeZone = 'UTC',
  mode: 'datetime' | 'time' = 'datetime'
): string {
  const date = parseUtcTimestamp(iso);
  if (!date) return 'Never';

  const safeTz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const options: Intl.DateTimeFormatOptions =
    mode === 'time'
      ? {
          timeZone: safeTz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZoneName: 'short',
        }
      : {
          timeZone: safeTz,
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZoneName: 'short',
        };

  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function sortByTimestampDesc<T>(items: T[], getIso: (item: T) => string | undefined | null): T[] {
  return [...items].sort((a, b) => {
    const da = parseUtcTimestamp(getIso(a))?.getTime() ?? 0;
    const db = parseUtcTimestamp(getIso(b))?.getTime() ?? 0;
    return db - da;
  });
}

export function filterWithinHours<T>(
  items: T[],
  getIso: (item: T) => string | undefined | null,
  hours: number,
  nowMs = Date.now()
): T[] {
  const cutoff = nowMs - hours * 3600 * 1000;
  return items.filter((item) => {
    const dt = parseUtcTimestamp(getIso(item));
    return dt !== null && dt.getTime() >= cutoff;
  });
}
