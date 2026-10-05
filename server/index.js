import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DATABASE_FILE ?? `${root}data/kajakklub.db`);

const app = createApp({
  db,
  inviteCode: process.env.CLUB_INVITE_CODE ?? '',
  staticDir: `${root}client/dist`,
});

const server = app.listen(port, () => {
  console.log(`Kajakklub-appen kører på http://localhost:${port}`);
  if (!process.env.CLUB_INVITE_CODE) {
    console.warn('Advarsel: CLUB_INVITE_CODE er ikke sat – alle kan oprette en bruger.');
  }
});

function shutdown() {
  app.locals.hub.closeAll();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
