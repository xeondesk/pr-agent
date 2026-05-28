import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withMiddleware } from '@/lib/api/middleware';
import { z } from 'zod';
import { getWebhookStats, getDeadLetterEvents } from '@/lib/webhooks/queue';

/**
 * GET /api/webhooks/status
 * Get webhook processing status and statistics
 */
export const GET = withMiddleware(
  z.object({
    includeDeadLetters: z.boolean().default(false),
  }),
  async (req) => {
    try {
      const { includeDeadLetters } = req.body as any;
      const userId = (req as any).userId;

      // Get overall stats
      const stats = await getWebhookStats(userId);

      if (!stats) {
        return NextResponse.json(
          { stats: { total: 0, pending: 0, processing: 0, success: 0, failed: 0, deadLetter: 0 } },
          { status: 200 }
        );
      }

      const response: any = { stats };

      // Optionally include dead letter events
      if (includeDeadLetters) {
        const deadLetters = await getDeadLetterEvents(userId, 50);
        response.deadLetterEvents = deadLetters;
      }

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      console.error('[v0] Error getting webhook status:', error);
      return NextResponse.json(
        { error: 'Failed to fetch webhook status' },
        { status: 500 }
      );
    }
  },
  { requireAuth: true }
);
