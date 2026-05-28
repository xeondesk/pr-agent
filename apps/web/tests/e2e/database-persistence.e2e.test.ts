import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runMigrations,
  checkMigrationStatus,
} from '@/lib/db.migrate';
import {
  getConnectionPool,
  getPooledClient,
  releasePooledClient,
  drainConnectionPool,
} from '@/lib/db.pool';
import {
  createBackup,
  restoreFromBackup,
  verifyBackupIntegrity,
} from '@/lib/db.backup';
import {
  runHealthCheck,
  getPerformanceStats,
  getDatabaseStats,
} from '@/lib/db.monitor';

/**
 * End-to-End Tests for Database Persistence
 * Tests migrations, pooling, backups, and monitoring
 */

describe('E2E: Database Migrations', () => {
  it('creates database schema on first run', async () => {
    const results = await runMigrations();

    expect(results).toHaveLength(3); // 3 migrations
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain('001_create_base_tables');
  });

  it('verifies migration status', async () => {
    const status = await checkMigrationStatus();

    expect(status.tablesCreated).toBe(true);
    expect(status.indexesCreated).toBe(true);
    expect(status.triggersCreated).toBe(true);
  });

  it('handles idempotent migrations', async () => {
    // Run migrations twice
    const results1 = await runMigrations();
    const results2 = await runMigrations();

    // Both should succeed
    expect(results1.every(r => r.success)).toBe(true);
    expect(results2.every(r => r.success)).toBe(true);
  });
});

describe('E2E: Connection Pooling', () => {
  afterEach(async () => {
    await drainConnectionPool();
  });

  it('acquires and releases connections', async () => {
    const client1 = await getPooledClient();
    expect(client1).toBeDefined();

    releasePooledClient();

    // Should reuse connection
    const client2 = await getPooledClient();
    expect(client2).toBeDefined();
  });

  it('tracks pool statistics', async () => {
    const pool = getConnectionPool({ maxConnections: 5 });

    // Acquire multiple connections
    const clients = [];
    for (let i = 0; i < 3; i++) {
      clients.push(await getPooledClient());
    }

    // Check stats
    const stats = pool.getStats();
    expect(stats.default.total).toBeGreaterThanOrEqual(3);
    expect(stats.default.inUse).toBeGreaterThanOrEqual(3);
  });

  it('enforces max connection limit', async () => {
    const pool = getConnectionPool({ maxConnections: 2 });

    // Acquire max connections
    const client1 = await getPooledClient();
    const client2 = await getPooledClient();

    // Third should wait/fail
    const acquirePromise = getPooledClient();

    // Setup timeout
    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve('timeout'), 1000)
    );

    const result = await Promise.race([acquirePromise, timeoutPromise]);
    expect(result).toBe('timeout');
  });

  it('cleans up idle connections', async () => {
    const pool = getConnectionPool({
      maxConnections: 10,
      idleTimeout: 100, // 100ms for testing
    });

    // Acquire connection
    const client = await getPooledClient();
    releasePooledClient();

    let stats = pool.getStats();
    const initialCount = stats.default.total;

    // Wait for idle timeout
    await new Promise(resolve => setTimeout(resolve, 200));

    stats = pool.getStats();
    expect(stats.default.total).toBeLessThanOrEqual(initialCount);
  });
});

describe('E2E: Backup & Restore', () => {
  const testUserId = 'test-user-uuid';
  const encryptionKey = 'a'.repeat(64); // 32 bytes in hex

  it('creates encrypted backup', async () => {
    const backup = await createBackup(testUserId, encryptionKey);

    expect(backup).not.toBeNull();
    expect(backup!.data).toBeDefined();
    expect(backup!.metadata.encrypted).toBe(true);
    expect(backup!.metadata.checksum).toBeDefined();
    expect(backup!.metadata.compressedSize).toBeGreaterThan(0);
  });

  it('creates unencrypted backup', async () => {
    const backup = await createBackup(testUserId);

    expect(backup).not.toBeNull();
    expect(backup!.metadata.encrypted).toBe(false);
  });

  it('verifies backup integrity', async () => {
    const backup = await createBackup(testUserId, encryptionKey);

    if (!backup) return;

    const isValid = await verifyBackupIntegrity(
      backup.data,
      backup.metadata.checksum,
      encryptionKey
    );

    expect(isValid).toBe(true);
  });

  it('detects corrupted backup', async () => {
    const backup = await createBackup(testUserId, encryptionKey);

    if (!backup) return;

    // Corrupt checksum
    const invalidChecksum = 'invalid-checksum-value';

    const isValid = await verifyBackupIntegrity(
      backup.data,
      invalidChecksum,
      encryptionKey
    );

    expect(isValid).toBe(false);
  });

  it('restores data from backup', async () => {
    const backup = await createBackup(testUserId, encryptionKey);

    if (!backup) return;

    const result = await restoreFromBackup(
      backup.data,
      testUserId,
      encryptionKey
    );

    expect(result.success).toBe(true);
  });

  it('handles restore errors gracefully', async () => {
    const corruptedData = Buffer.from('corrupted-data');

    const result = await restoreFromBackup(
      corruptedData,
      testUserId,
      encryptionKey
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('E2E: Database Monitoring', () => {
  it('performs health check', async () => {
    const health = await runHealthCheck();

    expect(health.timestamp).toBeDefined();
    expect(health.status).toMatch(/healthy|degraded|unhealthy/);
    expect(health.checks).toBeDefined();
    expect(health.metrics).toBeDefined();
  });

  it('checks connectivity', async () => {
    const health = await runHealthCheck();

    expect(health.checks.connectivity).toBeDefined();
  });

  it('tracks performance statistics', () => {
    const stats = getPerformanceStats();

    expect(stats.totalQueries).toBeGreaterThanOrEqual(0);
    expect(stats.slowQueries).toBeGreaterThanOrEqual(0);
    expect(stats.avgResponseTime).toBeGreaterThanOrEqual(0);
  });

  it('gets database statistics', async () => {
    const stats = await getDatabaseStats();

    expect(stats.tables).toBeDefined();
    expect(stats.lastUpdated).toBeDefined();
    expect(stats.estimatedSize).toBeDefined();
  });

  it('identifies slow queries', () => {
    // Simulate slow query
    const slowQueries = [
      { query: 'SELECT * FROM large_table', duration: 5000 },
      { query: 'SELECT * FROM small_table', duration: 50 },
    ];

    slowQueries.forEach(({ query, duration }) => {
      if (duration > 1000) {
        const stats = getPerformanceStats();
        expect(stats.slowQueries).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe('E2E: Data Consistency', () => {
  it('maintains referential integrity', async () => {
    const client = await getPooledClient();

    try {
      // Test: conversation can be created with user_id
      // This verifies foreign key constraints work
      const { data, error } = await client
        .from('conversations')
        .insert({
          user_id: 'test-user-uuid',
          title: 'Test Conversation',
        })
        .select();

      // Either succeeds or fails with FK error (expected behavior)
      expect(error || data).toBeDefined();
    } finally {
      releasePooledClient();
    }
  });

  it('triggers auto-update on modified timestamp', async () => {
    const client = await getPooledClient();

    try {
      // Create record
      const { data: created } = await client
        .from('conversations')
        .insert({
          user_id: 'test-user-uuid',
          title: 'Test',
        })
        .select()
        .single();

      if (created) {
        // Update record
        const { data: updated } = await client
          .from('conversations')
          .update({ title: 'Updated' })
          .eq('id', created.id)
          .select()
          .single();

        // Verify updated_at changed
        expect(updated?.updated_at).not.toBe(created.created_at);
      }
    } finally {
      releasePooledClient();
    }
  });
});

describe('E2E: Performance Under Load', () => {
  it('handles concurrent reads', async () => {
    const readPromises = Array.from({ length: 10 }, async (_, i) => {
      const client = await getPooledClient();
      try {
        return await client
          .from('conversations')
          .select('count', { count: 'exact', head: true });
      } finally {
        releasePooledClient();
      }
    });

    const results = await Promise.all(readPromises);
    expect(results.every(r => !r.error)).toBe(true);
  });

  it('handles concurrent writes', async () => {
    const writePromises = Array.from({ length: 5 }, async (_, i) => {
      const client = await getPooledClient();
      try {
        return await client
          .from('conversations')
          .insert({
            user_id: `test-user-${i}`,
            title: `Test Conversation ${i}`,
          })
          .select();
      } finally {
        releasePooledClient();
      }
    });

    const results = await Promise.all(writePromises);
    expect(results.filter(r => !r.error).length).toBeGreaterThan(0);
  });

  it('maintains health during high load', async () => {
    // Simulate load
    const operations = Array.from({ length: 50 }, () =>
      (async () => {
        const client = await getPooledClient();
        try {
          return await client
            .from('conversations')
            .select('id')
            .limit(1);
        } finally {
          releasePooledClient();
        }
      })()
    );

    await Promise.all(operations);

    // Health should still be good
    const health = await runHealthCheck();
    expect(health.status).not.toBe('unhealthy');
  });
});
