import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterWithinHours,
  formatInTimezone,
  isValidTimeZone,
  parseUtcTimestamp,
  sortByTimestampDesc,
} from './datetime';

describe('UTC Timestamp & IANA Timezone Utilities', () => {
  it('parses both Z-suffixed and naive UTC strings as UTC instants', () => {
    const withZ = parseUtcTimestamp('2026-05-01T18:30:00Z');
    const naive = parseUtcTimestamp('2026-05-01T18:30:00');
    assert.ok(withZ !== null && naive !== null);
    assert.equal(withZ.getTime(), naive.getTime());
    assert.equal(parseUtcTimestamp('not-a-date'), null);
  });

  it('converts UTC timestamps accurately across timezone day boundaries', () => {
    const utcIso = '2026-05-01T19:00:00Z';
    const istFormatted = formatInTimezone(utcIso, 'Asia/Kolkata', 'datetime');
    // 19:00 UTC + 05:30 = May 2, 00:30 IST
    assert.match(istFormatted, /May 2/);
    assert.match(istFormatted, /00:30/);

    const nyFormatted = formatInTimezone(utcIso, 'America/New_York', 'datetime');
    // 19:00 UTC in May (EDT UTC-4) = May 1, 15:00
    assert.match(nyFormatted, /May 1/);
    assert.match(nyFormatted, /15:00/);
  });

  it('validates IANA timezones and falls back to UTC on invalid zones', () => {
    assert.equal(isValidTimeZone('Asia/Kolkata'), true);
    assert.equal(isValidTimeZone('Mars/Olympus_Mons'), false);

    const formatted = formatInTimezone('2026-05-01T12:15:00Z', 'Invalid/Zone', 'time');
    assert.match(formatted, /12:15/);
    assert.match(formatted, /UTC/);
  });

  it('sorts descending and filters within hour windows using true parsed UTC timestamps', () => {
    const nowMs = Date.parse('2026-05-02T12:00:00Z');
    const events = [
      { id: 'old', ts: '2026-05-01T08:00:00Z' },
      { id: 'mid', ts: '2026-05-02T01:00:00Z' },
      { id: 'new', ts: '2026-05-02T11:30:00Z' },
    ];

    const sorted = sortByTimestampDesc(events, (e) => e.ts);
    assert.deepEqual(
      sorted.map((e) => e.id),
      ['new', 'mid', 'old']
    );

    const recent24h = filterWithinHours(events, (e) => e.ts, 24, nowMs);
    assert.deepEqual(
      recent24h.map((e) => e.id),
      ['mid', 'new']
    );
  });
});
