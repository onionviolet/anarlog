export class SelectionLoop {
  private range: { start: number; end: number } | null = null;

  select(start: number, end: number, duration: number): boolean {
    this.clear();
    if (![start, end, duration].every(Number.isFinite) || duration <= 0) {
      return false;
    }
    const boundedStart = Math.max(0, start);
    const boundedEnd = Math.min(end, duration);
    if (boundedEnd <= boundedStart) return false;
    this.range = { start: boundedStart, end: boundedEnd };
    return true;
  }

  restartAt(time: number): number | null {
    return this.range && time >= this.range.end ? this.range.start : null;
  }

  clear() {
    this.range = null;
  }
}
