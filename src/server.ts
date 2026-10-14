import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp.js';
import { createDemoSource } from './demo-source.js';
import { GitHubSource } from './github.js';
const mode = process.env.INVESTIGATOR_MODE ?? 'demo';
if (!['demo', 'github'].includes(mode)) throw new Error('INVESTIGATOR_MODE must be demo or github.');
const source = mode === 'demo' ? await createDemoSource() : new GitHubSource(process.env.GITHUB_REPO ?? '', process.env.GITHUB_TOKEN);
const logPath = mode === 'demo' ? new URL('../fixtures/logs.json', import.meta.url) : process.env.LOG_FILE;
await createServer(source, logPath).connect(new StdioServerTransport());
