import { createClient } from '@supabase/supabase-js';

/**
 * Database Monitoring & Health Checks
 * Tracks performance, connectivity, and data integrity
 */

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    connectivity: boolean;
    responsiveness: boolean;
    dataIntegrity: boolean;
    performanceOk: boolean;
  };
  metrics: {
    responseTime: number;
    activeConnections: number;
    diskUsage: string;
    cacheHitRate: number;
  };
  errors: string[];
}

export interface QueryPerformance {
  query: string;
  duration: number;
  timestamp: string;
  slow: boolean;
}

// Slow query threshold (ms)
const SLOW_QUERY_THRESHOLD = 1000;

// Performance metrics storage
const performanceMetrics: QueryPerformance[] = [];
const maxMetricsStored = 1000;

/**
 * Record query performance
 */
export function recordQueryPerformance(
  query: string,
  duration: number
): void {
  const metric: QueryPerformance = {
    query,
    duration,
    timestamp: new Date().toISOString(),
    slow: duration > SLOW_QUERY_THRESHOLD,
  };

  performanceMetrics.push(metric);

  // Keep only recent metrics
  if (performanceMetrics.length > maxMetricsStored) {
    performanceMetrics.shift();
  }

  if (metric.slow) {
    console.warn(`[v0] Slow query detected (${duration}ms): ${query}`);
  }
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(): {
  totalQueries: number;
  slowQueries: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
} {
  if (performanceMetrics.length === 0) {
    return {
      totalQueries: 0,
      slowQueries: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
    };
  }

  const durations = performanceMetrics.map(m => m.duration).sort((a, b) => a - b);
  const slowQueries = performanceMetrics.filter(m => m.slow).length;

  return {
    totalQueries: performanceMetrics.length,
    slowQueries,
    avgResponseTime: Math.round(durations.reduce((a, b) => a + b) / durations.length),
    p95ResponseTime: durations[Math.floor(durations.length * 0.95)],
    p99ResponseTime: durations[Math.floor(durations.length * 0.99)],
  };
}

/**
 * Get slow queries
 */
export function getSlowQueries(limit: number = 10): QueryPerformance[] {
  return performanceMetrics
    .filter(m => m.slow)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, limit);
}

/**
 * Run database health check
 */
export async function runHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const checks = {
    connectivity: false,
    responsiveness: false,
    dataIntegrity: false,
    performanceOk: false,
  };

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      errors.push('Supabase not configured');
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks,
        metrics: {
          responseTime: Date.now() - startTime,
          activeConnections: 0,
          diskUsage: 'unknown',
          cacheHitRate: 0,
        },
        errors,
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check 1: Connectivity
    try {
      const { error } = await supabase.from('conversations').select('count', { count: 'exact', head: true }).limit(1);
      checks.connectivity = !error;
      if (error) errors.push(`Connectivity check failed: ${error.message}`);
    } catch (error) {
      checks.connectivity = false;
      errors.push(`Connectivity error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Check 2: Responsiveness
    const responseStartTime = Date.now();
    try {
      const { error } = await supabase.from('user_profiles').select('id', { count: 'exact', head: true }).limit(1);
      const responseTime = Date.now() - responseStartTime;
      checks.responsiveness = responseTime < 5000 && !error;
      if (responseTime > 5000) errors.push(`Slow response time: ${responseTime}ms`);
    } catch (error) {
      checks.responsiveness = false;
      errors.push(`Responsiveness check failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Check 3: Data Integrity
    try {
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .limit(1);

      const { data: messages, error: msgError } = await supabase
        .from('conversation_messages')
        .select('conversation_id')
        .limit(1);

      checks.dataIntegrity = !convError && !msgError;
      if (convError || msgError) {
        errors.push('Data integrity check failed');
      }
    } catch (error) {
      checks.dataIntegrity = false;
      errors.push(`Data integrity error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Check 4: Performance
    const perf = getPerformanceStats();
    checks.performanceOk = perf.p99ResponseTime < 5000;
    if (!checks.performanceOk) {
      errors.push(`Performance degraded: p99=${perf.p99ResponseTime}ms`);
    }
  } catch (error) {
    errors.push(`Health check error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  const responseTime = Date.now() - startTime;
  const allChecksPassed = Object.values(checks).every(c => c);
  const someChecksFailed = Object.values(checks).some(c => !c);

  const perf = getPerformanceStats();

  return {
    status: allChecksPassed ? 'healthy' : someChecksFailed ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
    metrics: {
      responseTime,
      activeConnections: 0, // Would need monitoring DB for this
      diskUsage: 'unknown', // Supabase-specific
      cacheHitRate: 0, // Supabase-specific
    },
    errors,
  };
}

/**
 * Monitor connection pool health
 */
export function monitorConnectionPool(getPoolStats: () => Record<string, any>): {
  healthy: boolean;
  poolStats: Record<string, any>;
  warnings: string[];
} {
  const stats = getPoolStats();
  const warnings: string[] = [];

  for (const [poolKey, stat] of Object.entries(stats)) {
    if (stat.inUse === stat.total) {
      warnings.push(`Connection pool "${poolKey}" is at maximum capacity`);
    }
    if (stat.total > 100) {
      warnings.push(`Connection pool "${poolKey}" has unusually high connection count`);
    }
  }

  return {
    healthy: warnings.length === 0,
    poolStats: stats,
    warnings,
  };
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  tables: Record<string, number>;
  lastUpdated: string;
  estimatedSize: string;
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return { tables: {}, lastUpdated: new Date().toISOString(), estimatedSize: 'unknown' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const tables = [
      'user_profiles',
      'conversations',
      'conversation_messages',
      'webhook_configs',
      'webhook_events',
      'user_api_keys',
      'feedback',
      'audit_logs',
      'api_usage',
      'webhook_event_queue',
      'webhook_deliveries',
    ];

    const stats: Record<string, number> = {};

    for (const table of tables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });

        if (!error && count !== null) {
          stats[table] = count;
        }
      } catch (error) {
        // Skip table if error
      }
    }

    const totalRows = Object.values(stats).reduce((a, b) => a + b, 0);
    const estimatedSize = `~${(totalRows * 0.001).toFixed(2)} MB`;

    return {
      tables: stats,
      lastUpdated: new Date().toISOString(),
      estimatedSize,
    };
  } catch (error) {
    console.error('[v0] Error getting database stats:', error);
    return { tables: {}, lastUpdated: new Date().toISOString(), estimatedSize: 'unknown' };
  }
}

/**
 * Clear performance metrics
 */
export function clearPerformanceMetrics(): void {
  performanceMetrics.length = 0;
}

/**
 * Export performance metrics
 */
export function exportPerformanceMetrics(): QueryPerformance[] {
  return [...performanceMetrics];
}
