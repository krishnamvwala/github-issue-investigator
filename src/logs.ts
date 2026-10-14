import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { bounded } from './domain.js';
const entrySchema = z.object({
  timestamp: z.string().datetime(), level: z.enum(['info', 'warn', 'error']),
  release: z.string().max(200), message: z.string().max(20000)
});
export async function searchLogs(path: string | URL | undefined, query: string, release?: string) {
  if (!path) return { available: false, entries: [], truncated: false, note: 'No logs configured. Set LOG_FILE to a sanitized JSON array.' };
  if ((await stat(path)).size > 2_000_000) throw new Error('Log file exceeds the 2 MB limit.');
  const logs = z.array(entrySchema).max(10000).parse(JSON.parse(await readFile(path, 'utf8')));
  const matches = logs.filter(e => e.message.toLowerCase().includes(query.toLowerCase()) && (!release || e.release === release));
  return { available: true, entries: matches.slice(0, 50).map(e => ({ ...e, message: bounded(e.message, 4000) })), total: matches.length, truncated: matches.length > 50 };
}
