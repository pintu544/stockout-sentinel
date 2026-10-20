import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledFrame: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
