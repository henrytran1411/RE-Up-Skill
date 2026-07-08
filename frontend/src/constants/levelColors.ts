/**
 * Keyed by level name (matching a SkillLevel catalog entry, e.g. "Senior")
 * rather than a fixed enum, since levels are now admin-managed. Covers the
 * seeded 5-tier catalog; getLevelColor falls back gracefully for any other
 * name (renamed/added levels).
 */
export const LEVEL_COLOR: Record<string, string> = {
  Junior: '#91caff',
  Middle: '#4096ff',
  Senior: '#0958d9',
  Expert: '#722ed1',
  Master: '#eb2f96',
};

const DEFAULT_LEVEL_COLOR = '#d9d9d9';

export function getLevelColor(level: string): string {
  return LEVEL_COLOR[level] ?? DEFAULT_LEVEL_COLOR;
}
