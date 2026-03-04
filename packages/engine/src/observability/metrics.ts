export interface MetricsSink {
  counter(name: string, value?: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
}

export class NoopMetrics implements MetricsSink {
  counter(): void {}
  histogram(): void {}
  gauge(): void {}
}

export class InMemoryMetrics implements MetricsSink {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly gauges = new Map<string, number>();

  counter(name: string, value = 1, labels?: Record<string, string>): void {
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = metricKey(name, labels);
    const entries = this.histograms.get(key) ?? [];
    entries.push(value);
    this.histograms.set(key, entries);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = metricKey(name, labels);
    this.gauges.set(key, value);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        [...this.histograms.entries()].map(([key, values]) => [key, [...values]]),
      ),
    };
  }

  p95(name: string, labels?: Record<string, string>): number | null {
    const key = metricKey(name, labels);
    const values = this.histograms.get(key);
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return sorted[idx] ?? null;
  }
}

function metricKey(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const suffix = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${name}{${suffix}}`;
}
