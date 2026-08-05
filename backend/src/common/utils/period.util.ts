import { PerformancePeriodHalf } from '../../performance/entities/performance-score-record.entity';

export interface HalfYearPeriod {
  year: number;
  half: PerformancePeriodHalf;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function currentPeriod(): HalfYearPeriod {
  const now = new Date();
  return { year: now.getFullYear(), half: now.getMonth() < 6 ? PerformancePeriodHalf.H1 : PerformancePeriodHalf.H2 };
}

export function previousPeriod({ year, half }: HalfYearPeriod): HalfYearPeriod {
  return half === PerformancePeriodHalf.H1
    ? { year: year - 1, half: PerformancePeriodHalf.H2 }
    : { year, half: PerformancePeriodHalf.H1 };
}

export function periodBounds(year: number, half: PerformancePeriodHalf): { periodStart: string; periodEnd: string } {
  return half === PerformancePeriodHalf.H1
    ? { periodStart: `${year}-01-01`, periodEnd: `${year}-06-30` }
    : { periodStart: `${year}-07-01`, periodEnd: `${year}-12-31` };
}

/** Which half-year period a given `YYYY-MM-DD` date string falls into. */
export function periodFromDate(dateStr: string): HalfYearPeriod {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  return { year, half: month <= 6 ? PerformancePeriodHalf.H1 : PerformancePeriodHalf.H2 };
}

/** The `count` most recent half-year periods up to and including the current one, oldest first. */
export function lastNHalfYearPeriods(count: number): HalfYearPeriod[] {
  const periods = [currentPeriod()];
  while (periods.length < count) {
    periods.unshift(previousPeriod(periods[0]));
  }
  return periods;
}
