const MINUTES_PER_DAY = 1440;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight; a window with start > end crosses midnight. */
export interface PeakWindow {
  start: number;
  end: number;
}

/** "HH:mm" -> minutes since midnight. */
export function parseClock(clock: string): number {
  const match = CLOCK.exec(clock);
  if (!match) throw new Error(`Invalid time "${clock}", expected HH:mm`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "07:00-09:00,17:00-19:00" -> windows; an empty string means no peak hours. */
export function parsePeakHours(spec: string): PeakWindow[] {
  if (spec === '') return [];
  return spec.split(',').map((range) => {
    const [from, to, ...rest] = range.split('-');
    if (
      to === undefined ||
      rest.length > 0 ||
      !CLOCK.test(from) ||
      !CLOCK.test(to)
    ) {
      throw new Error(
        `Invalid PEAK_HOURS range "${range}", expected HH:mm-HH:mm`,
      );
    }
    const window = { start: parseClock(from), end: parseClock(to) };
    if (window.start === window.end) {
      throw new Error(`Invalid PEAK_HOURS range "${range}": start equals end`);
    }
    return window;
  });
}

/** Windows are [start, end); minute may exceed one day (trips past midnight). */
export function isPeak(minute: number, windows: PeakWindow[]): boolean {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return windows.some(({ start, end }) =>
    start < end ? m >= start && m < end : m >= start || m < end,
  );
}
