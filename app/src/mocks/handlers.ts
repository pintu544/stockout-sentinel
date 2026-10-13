import { http, HttpResponse } from 'msw';

/**
 * MSW handlers for stockout-sentinel API routes.
 * Used in Vitest via setupServer (see src/mocks/server.ts).
 * Add handlers here as new API routes need test coverage.
 */
export const handlers = [
  // GET /api/health -> service status
  http.get('http://localhost:3000/api/health', () => {
    return HttpResponse.json({
      ok: true,
      postgres: true,
      infini: true,
      quota: 'unknown' as const,
    });
  }),

  // POST /api/analysis -> start analysis task
  http.post('http://localhost:3000/api/analysis', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return HttpResponse.json(
      { taskId: 'test-task-123', status: 'queued', received: body },
      { status: 202 }
    );
  }),
];
