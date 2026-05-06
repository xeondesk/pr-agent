import {
  queueAnalysisJob,
  getJobStatus,
} from '../../../lib/jobQueue';

export async function POST(request: Request) {
  try {
    const { prUrl, diff, capabilities } = await request.json();

    if (!prUrl && !diff) {
      return new Response(
        JSON.stringify({ error: 'Either prUrl or diff is required' }),
        { status: 400 }
      );
    }

    // Queue the job
    const jobId = await queueAnalysisJob({
      prUrl,
      diff,
      capabilities,
    });

    return new Response(
      JSON.stringify({
        jobId,
        status: 'queued',
        message: 'Analysis job queued successfully',
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Failed to queue job:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'Missing jobId parameter' }),
        { status: 400 }
      );
    }

    const status = await getJobStatus(jobId);

    if (!status) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404 }
      );
    }

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500 }
    );
  }
}
