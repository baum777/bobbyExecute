export interface MetricsCollector {
  counter(name: string, value?: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
}

export class NoOpMetrics implements MetricsCollector {
  counter(): void { /* no-op */ }
  histogram(): void { /* no-op */ }
  gauge(): void { /* no-op */ }
}

export class InMemoryMetrics implements MetricsCollector {
  readonly counters = new Map<string, number>();
  readonly histograms = new Map<string, number[]>();
  readonly gauges = new Map<string, number>();

  counter(name: string, value = 1, _labels?: Record<string, string>): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }
  histogram(name: string, value: number, _labels?: Record<string, string>): void {
    const arr = this.histograms.get(name) ?? [];
    arr.push(value);
    this.histograms.set(name, arr);
  }
  gauge(name: string, value: number, _labels?: Record<string, string>): void {
    this.gauges.set(name, value);
  }
}

export function emitRunMetrics(
  m: MetricsCollector,
  status: string,
  universeSize: number,
  avgCompleteness: number,
  avgConfidence: number,
  avgDiscrepancy: number,
  divergenceCounts: number[],
  profile: string,
  durationMs: number,
): void {
  m.counter("reducedmode_runs_total", 1, { status });
  m.gauge("token_universe_size", universeSize);
  m.gauge("data_completeness_score_avg", avgCompleteness);
  m.gauge("cross_source_confidence_avg", avgConfidence);
  m.gauge("discrepancy_rate_percent_avg", avgDiscrepancy);
  for (const dc of divergenceCounts) {
    m.histogram("divergence_count_histogram", dc);
  }
  m.counter("profiles_used_total", 1, { profile });
  m.histogram("reducedmode_run_duration_ms", durationMs);
}
