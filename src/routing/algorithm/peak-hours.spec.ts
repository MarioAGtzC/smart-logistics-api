import { formatClock, isPeak, parseClock, parsePeakHours } from './peak-hours';

const at = (clock: string) => parseClock(clock);

describe('parseClock', () => {
  it('converts HH:mm to minutes since midnight', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('06:50')).toBe(410);
    expect(parseClock('23:59')).toBe(1439);
  });

  it.each(['24:00', '7:05', '07:60', 'noon', ''])('rejects "%s"', (clock) => {
    expect(() => parseClock(clock)).toThrow(/HH:mm/);
  });
});

describe('parsePeakHours', () => {
  it('parses comma-separated windows into minutes', () => {
    expect(parsePeakHours('07:00-09:00,17:00-19:00')).toEqual([
      { start: 420, end: 540 },
      { start: 1020, end: 1140 },
    ]);
  });

  it('treats an empty value as "no peak hours"', () => {
    expect(parsePeakHours('')).toEqual([]);
  });

  it.each(['07:00', '7-9', '07:00-09:00,', '25:00-26:00', '10:00-10:00'])(
    'rejects "%s"',
    (spec) => {
      expect(() => parsePeakHours(spec)).toThrow(/PEAK_HOURS/);
    },
  );
});

describe('isPeak', () => {
  const windows = parsePeakHours('07:00-09:00,17:00-19:00');

  it.each([
    ['06:59', false],
    ['07:00', true],
    ['08:59', true],
    ['09:00', false],
    ['12:00', false],
    ['17:00', true],
    ['18:59', true],
    ['19:00', false],
  ])('%s -> %s (windows are [start, end))', (clock, expected) => {
    expect(isPeak(at(clock), windows)).toBe(expected);
  });

  it('wraps times past midnight (modulo 24h)', () => {
    expect(isPeak(at('07:30') + 1440, windows)).toBe(true);
    expect(isPeak(at('12:00') + 1440, windows)).toBe(false);
  });

  it('supports a window that crosses midnight', () => {
    const night = parsePeakHours('23:00-01:00');
    expect(isPeak(at('23:30'), night)).toBe(true);
    expect(isPeak(at('00:30'), night)).toBe(true);
    expect(isPeak(at('01:00'), night)).toBe(false);
    expect(isPeak(at('22:59'), night)).toBe(false);
  });

  it('is never peak without windows', () => {
    expect(isPeak(at('08:00'), [])).toBe(false);
  });
});

describe('formatClock', () => {
  it.each([
    [410, '06:50'],
    [0, '00:00'],
    [519.5, '08:40'],
    [1445, '00:05'],
    [1439.6, '00:00'],
  ])('%s minutes -> %s (rounded, modulo 24h)', (minutes, expected) => {
    expect(formatClock(minutes)).toBe(expected);
  });
});
