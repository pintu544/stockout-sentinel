import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** MSW server for Vitest. Import in test setup file. */
export const server = setupServer(...handlers);
