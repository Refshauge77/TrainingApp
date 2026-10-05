import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HttpError, loadUser, requireUser } from './auth.js';
import { createNotifier } from './notify.js';
import { createHub } from './realtime.js';
import { eventsRouter } from './routes/events.js';
import { pushRouter } from './routes/push.js';
import { threadsRouter } from './routes/threads.js';
import { usersRouter } from './routes/users.js';

export function createApp({ db, inviteCode = '', staticDir = null, sendPush }) {
  const app = express();
  const hub = createHub();
  const notifier = createNotifier({ db, send: sendPush });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '200kb' }));
  app.use(loadUser(db));

  const api = express.Router();
  api.use(usersRouter({ db, inviteCode }));
  api.use(eventsRouter({ db, hub, notifier }));
  api.use(threadsRouter({ db, hub, notifier }));
  api.use(pushRouter({ db, notifier }));
  api.get('/stream', requireUser, hub.subscribe);
  api.use((_req, _res, next) => next(new HttpError(404, 'Ikke fundet')));
  app.use('/api', api);

  if (staticDir && existsSync(staticDir)) {
    // The service worker must always be fresh, or app updates can get stuck.
    app.get('/sw.js', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(join(staticDir, 'sw.js')));
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
  app.locals.notifier = notifier;
  return app;
}
