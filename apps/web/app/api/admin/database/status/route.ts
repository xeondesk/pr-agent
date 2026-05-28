import { NextRequest, NextResponse } from 'next/server';
import { runHealthCheck, getPerformanceStats, getDatabaseStats } from '@/lib/db.monitor';
import { withMiddleware } from '@/lib/api/middleware';
import { z } from 'zod';

/**
 * GET /api/admin/database/status
 * Get comprehensive database health and status information
 */
export const GET = withMiddleware(
  z.object({}),
  async (req) => {
    try {
      // Run health check
      const health = await runHealthCheck();

      // Get performance stats
      const performance = getPerformanceStats();

      // Get database stats
      const dbStats = await getDatabaseStats();

      return NextResponse.json(
        {
          health,
          performance,
          database: dbStats,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    } catch (error) {
      console.error('[v0] Error getting database status:', error);
      return NextResponse.json(
        { error: 'Failed to get database status' },
        { status: 500 }
      );
    }
  },
  { requireAuth: true, requireAdmin: true }
);
