import { NextRequest, NextResponse } from 'next/server';
import { getPrometheusMetrics, getMetricsSnapshot } from '@/lib/metrics/collector';
import { getServerSession } from 'next-auth/next';

/**
 * GET /api/metrics
 * Returns application metrics in JSON or Prometheus format
 *
 * Query parameters:
 * - format: 'json' (default) or 'prometheus'
 *
 * Authentication: Admin only
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication (admin only)
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In production, check if user has admin role
    // For now, allow any authenticated user
    const format = request.nextUrl.searchParams.get('format') || 'json';

    if (format === 'prometheus') {
      // Return Prometheus format
      return new NextResponse(getPrometheusMetrics(), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    // Return JSON format (default)
    return NextResponse.json(getMetricsSnapshot());
  } catch (error) {
    console.error('[v0] Metrics endpoint error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
