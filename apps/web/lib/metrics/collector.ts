/**
 * Simple metrics collection system for monitoring application health
 * Uses in-memory counters and histograms
 * For production, integrate with Prometheus or similar
 */

export interface MetricValue {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private startTime: number = Date.now();

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  /**
   * Record a histogram value (latency, duration, etc.)
   */
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const histogram = this.histograms.get(key) || [];
    histogram.push(value);
    this.histograms.set(key, histogram);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.buildKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * Get histogram statistics
   */
  getHistogram(name: string, labels?: Record<string, string>): MetricValue {
    const key = this.buildKey(name, labels);
    const values = this.histograms.get(key) || [];

    if (values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;

    return {
      count: sorted.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get all metrics as Prometheus format
   */
  getPrometheusMetrics(): string {
    let output = '# HELP application metrics\n# TYPE application_info gauge\n';

    // Application info
    output += `application_info{version="1.0.0"} 1\n`;
    output += `application_uptime_seconds ${(Date.now() - this.startTime) / 1000}\n\n`;

    // Counters
    output += '# TYPE counter gauge\n';
    for (const [name, value] of this.counters) {
      output += `counter_${name} ${value}\n`;
    }

    output += '\n';

    // Histograms
    output += '# TYPE histogram summary\n';
    for (const [name, values] of this.histograms) {
      const stats = this.getHistogram(name);
      output += `histogram_${name}_count ${stats.count}\n`;
      output += `histogram_${name}_sum ${stats.sum}\n`;
      output += `histogram_${name}_min ${stats.min}\n`;
      output += `histogram_${name}_max ${stats.max}\n`;
      output += `histogram_${name}_avg ${stats.avg.toFixed(2)}\n`;
      output += `histogram_${name}_p50 ${stats.p50.toFixed(2)}\n`;
      output += `histogram_${name}_p95 ${stats.p95.toFixed(2)}\n`;
      output += `histogram_${name}_p99 ${stats.p99.toFixed(2)}\n`;
    }

    return output;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.startTime = Date.now();
  }

  /**
   * Get summary of all metrics
   */
  getSummary(): Record<string, unknown> {
    const summary: Record<string, unknown> = {
      uptime_seconds: (Date.now() - this.startTime) / 1000,
      counters: Object.fromEntries(this.counters),
      histograms: {},
    };

    for (const [name] of this.histograms) {
      (summary.histograms as Record<string, unknown>)[name] = this.getHistogram(name);
    }

    return summary;
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}{${labelStr}}`;
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

// Convenience functions
export function incrementCounter(name: string, value?: number, labels?: Record<string, string>): void {
  metrics.incrementCounter(name, value, labels);
}

export function recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
  metrics.recordHistogram(name, value, labels);
}

export function getMetricsSnapshot(): Record<string, unknown> {
  return metrics.getSummary();
}

export function getPrometheusMetrics(): string {
  return metrics.getPrometheusMetrics();
}
