import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HttpError, loadUser, requireUser } from './auth.js';
import { createHub } from './realtime.js';
import { eventsRouter } from './routes/events.js';
import { threadsRouter } from './routes/threads.js';
import { usersRouter } from './routes/users.js';

export function createApp({ db, inviteCode = '', staticDir = null }) {
  const app = express();
  const hub = createHub();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '200kb' }));
  app.use(loadUser(db));

  const api = express.Router();
  api.use(usersRouter({ db, inviteCode }));
  api.use(eventsRouter({ db, hub }));
  api.use(threadsRouter({ db, hub }));
  api.get('/stream', requireUser, hub.subscribe);
  api.use((_req, _res, next) => next(new HttpError(404, 'Ikke fundet')));
  app.use('/api', api);

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    // Single page app: every other route is handled client-side.
    app.get('/{*path}', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Der skete en fejl på serveren' : err.message });
  });

  app.locals.hub = hub;
  return app;
}
