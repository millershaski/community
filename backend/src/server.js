import { createApp } from './app.js';
import { ensureDefaultMembers, openDb } from './db.js';

const port = Number(process.env.PORT) || 3000;
const accessCode = process.env.ACCESS_CODE || '';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (!accessCode) console.warn('WARNING: ACCESS_CODE is not set - anyone who can reach this API can read and modify data.');
if (!allowedOrigins.length) console.warn('WARNING: ALLOWED_ORIGINS is not set - any website may call this API from a browser.');

const db = openDb();
ensureDefaultMembers(db);
const app = createApp(db, { accessCode, allowedOrigins, trustProxy: Number(process.env.TRUST_PROXY) || 0 });

const server = app.listen(port, '0.0.0.0', () => console.log(`TheCommunity API listening on port ${port}`));

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
