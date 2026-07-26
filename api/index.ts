import type { IncomingMessage, ServerResponse } from 'http';
import { handleDashboardRequest } from '../src/dashboard/server.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleDashboardRequest(req, res);
}
