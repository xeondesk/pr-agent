import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/db';
import { z } from 'zod/v4';
import { withMiddleware } from '@/lib/api/middleware';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: 'ok' | 'error'; latency?: number };
    api: { status: 'ok' };
    openai: { status: 'ok' | 'error'; configured: boolean };
    redis: { status: 'ok' | 'error' | 'not_configured' };
  };
}

const startTime = Date.now();

const healthSchema = z.object({});

export const GET = withMiddleware(healthSchema, async () => {
  const checks: HealthStatus['checks'] = {
    database: { status: 'error' },
    api: { status: 'ok' },
    openai: { status: 'ok', configured: !!process.env.OPENAI_API_KEY },
    redis: { status: 'not_configured' },
  };

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const dbStart = Date.now();
        const { error } = await supabase.from('conversations').select('id').limit(1);
        checks.database = {
          status: error ? 'error' : 'ok',
          latency: Date.now() - dbStart,
        };
      }
    } catch {
      checks.database = { status: 'error' };
    }
  } else {
    checks.database = { status: 'ok', latency: 0 };
  }

  const hasDegradation = Object.values(checks).some((c) => c.status === 'error');
  const overallStatus: HealthStatus['status'] = hasDegradation ? 'degraded' : 'healthy';

  const body: HealthStatus = {
    status: overallStatus,
    version: '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks,
  };

  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  return NextResponse.json(body, { status: statusCode });
});
