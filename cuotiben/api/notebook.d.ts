import type { IncomingMessage, ServerResponse } from 'node:http';

export function notebookHandler(
  key?: string, timeoutMs?: number, config?: NodeJS.ProcessEnv, allowedOrigins?: Set<string>,
): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
