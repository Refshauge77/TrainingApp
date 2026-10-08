import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DATABASE_FILE ?? `${root}data/holteroklub.db`);

const app = createApp({
  db,
  inviteCode: process.env.CLUB_INVITE_CODE ?? '',
  staticDir: `${root}client/dist`,
  devClientUrl: process.env.KAJAK_DEV_CLIENT_URL,
});

const server = app.listen(port, () => {
  if (process.env.KAJAK_DEV_CLIENT_URL) {
    console.log(`API-serveren kører på port ${port}.`);
  } else if (existsSync(`${root}client/dist`)) {
    console.log(`\n  Holte Roklub-appen kører – åbn http://localhost:${port}\n`);
  } else {
    console.warn('Appen er ikke bygget endnu – kør "npm run build" før "npm start".');
  }
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
