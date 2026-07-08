export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function diffInDays(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}
