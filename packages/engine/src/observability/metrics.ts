export interface MetricsCollector {
  counter(name: string, value?: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
}

export class NoOpMetrics implements MetricsCollector {
  counter(_name: string, _value?: number, _labels?: Record<string, string>): void {
    /* no-op */
  }
  histogram(_name: string, _value: number, _labels?: Record<string, string>): void {
    /* no-op */
  }
  gauge(_name: string, _value: number, _labels?: Record<string, string>): void {
    /* no-op */
  }
}

export class InMemoryMetrics implements MetricsCollector {
  readonly counters = new Map<string, number>();
  readonly histograms = new Map<string, number[]>();
  readonly gauges = new Map<string, number>();

  counter(name: string, value = 1, _labels?: Record<string, string>): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  histogram(name: string, value: number, _labels?: Record<string, string>): void {
    const existing = this.histograms.get(name) ?? [];
    existing.push(value);
    this.histograms.set(name, existing);
  }

  gauge(name: string, value: number, _labels?: Record<string, string>): void {
    this.gauges.set(name, value);
  }
}
