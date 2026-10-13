import { describe, it, expect } from 'vitest';

const BASE = 'http://localhost:3000';

/**
 * Example: testing API routes through MSW network-level mocks.
 * No vi.mock() needed — fetch is intercepted at the network layer.
 */
describe('API mocks', () => {
  it('GET /api/health returns service status', async () => {
    const res = await fetch(`${BASE}/api/health`);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.postgres).toBe(true);
    expect(data.quota).toBe('unknown');
  });

  it('POST /api/analysis queues a task', async () => {
    const res = await fetch(`${BASE}/api/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'TEST-001' }),
    });
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.taskId).toBe('test-task-123');
    expect(data.status).toBe('queued');
  });
});
