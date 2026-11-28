// Production entry: the SvelteKit handler plus the inbox socket, which adapter-node
// can't serve by itself. Replaces `node build`.
import { createServer } from 'node:http';
import { handler } from './build/handler.js';
import { attachInboxHub } from './ws/hub.js';

const server = createServer(handler);
const closeHub = attachInboxHub(server, {
	secret: process.env.BETTER_AUTH_SECRET,
	databaseUrl: process.env.DATABASE_URL
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Listening on port ${port}`));

let closing = false;
async function shutdown() {
	if (closing) return;
	closing = true;
	await closeHub();
	server.close(() => process.exit(0));
	server.closeIdleConnections();
	setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
