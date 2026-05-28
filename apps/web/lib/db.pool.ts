import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Database Connection Pooling
 * Manages Supabase client instances with connection pooling and caching
 */

interface PoolConfig {
  maxConnections: number;
  idleTimeout: number;
  acquireTimeout: number;
}

interface PooledConnection {
  client: SupabaseClient;
  lastUsed: number;
  inUse: boolean;
}

const DEFAULT_CONFIG: PoolConfig = {
  maxConnections: 10,
  idleTimeout: 30000, // 30 seconds
  acquireTimeout: 5000, // 5 seconds
};

class ConnectionPool {
  private pool: Map<string, PooledConnection[]> = new Map();
  private config: PoolConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupInterval();
  }

  /**
   * Get or create a pooled connection
   */
  async acquireConnection(
    supabaseUrl: string,
    supabaseKey: string,
    poolKey: string = 'default'
  ): Promise<SupabaseClient> {
    if (!this.pool.has(poolKey)) {
      this.pool.set(poolKey, []);
    }

    const connections = this.pool.get(poolKey)!;
    const now = Date.now();

    // Try to find available connection
    for (const connection of connections) {
      if (!connection.inUse) {
        connection.inUse = true;
        connection.lastUsed = now;
        return connection.client;
      }
    }

    // Create new connection if under limit
    if (connections.length < this.config.maxConnections) {
      const client = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const pooledConnection: PooledConnection = {
        client,
        lastUsed: now,
        inUse: true,
      };

      connections.push(pooledConnection);
      return client;
    }

    // Wait for available connection
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        for (const connection of connections) {
          if (!connection.inUse) {
            connection.inUse = true;
            connection.lastUsed = Date.now();
            clearInterval(checkInterval);
            resolve(connection.client);
            return;
          }
        }

        if (Date.now() - startTime > this.config.acquireTimeout) {
          clearInterval(checkInterval);
          reject(new Error('Connection acquire timeout'));
        }
      }, 100);
    });
  }

  /**
   * Release connection back to pool
   */
  releaseConnection(poolKey: string = 'default'): void {
    const connections = this.pool.get(poolKey);
    if (!connections) return;

    const connection = connections.find(c => c.inUse);
    if (connection) {
      connection.inUse = false;
      connection.lastUsed = Date.now();
    }
  }

  /**
   * Clean up idle connections
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();

      for (const [poolKey, connections] of this.pool.entries()) {
        const remaining: PooledConnection[] = [];

        for (const connection of connections) {
          const isIdle = !connection.inUse && (now - connection.lastUsed) > this.config.idleTimeout;

          if (!isIdle) {
            remaining.push(connection);
          }
        }

        if (remaining.length === 0) {
          this.pool.delete(poolKey);
        } else if (remaining.length < connections.length) {
          this.pool.set(poolKey, remaining);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Get pool statistics
   */
  getStats(): Record<string, { total: number; inUse: number; available: number }> {
    const stats: Record<string, { total: number; inUse: number; available: number }> = {};

    for (const [poolKey, connections] of this.pool.entries()) {
      stats[poolKey] = {
        total: connections.length,
        inUse: connections.filter(c => c.inUse).length,
        available: connections.filter(c => !c.inUse).length,
      };
    }

    return stats;
  }

  /**
   * Drain all connections
   */
  async drain(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const connections of this.pool.values()) {
      connections.length = 0;
    }

    this.pool.clear();
  }
}

// Singleton instance
let poolInstance: ConnectionPool | null = null;

/**
 * Get or create the connection pool singleton
 */
export function getConnectionPool(config?: Partial<PoolConfig>): ConnectionPool {
  if (!poolInstance) {
    poolInstance = new ConnectionPool(config);
  }
  return poolInstance;
}

/**
 * Get a Supabase client from the pool
 */
export async function getPooledClient(
  supabaseUrl?: string,
  supabaseKey?: string,
  poolKey?: string
): Promise<SupabaseClient> {
  const url = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }

  const pool = getConnectionPool();
  return pool.acquireConnection(url, key, poolKey);
}

/**
 * Release a client back to the pool
 */
export function releasePooledClient(poolKey: string = 'default'): void {
  const pool = getConnectionPool();
  pool.releaseConnection(poolKey);
}

/**
 * Get pool statistics for monitoring
 */
export function getPoolStats(): Record<string, { total: number; inUse: number; available: number }> {
  const pool = getConnectionPool();
  return pool.getStats();
}

/**
 * Drain the connection pool (useful for cleanup)
 */
export async function drainConnectionPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.drain();
    poolInstance = null;
  }
}
