import { Router } from 'express';
import {
  HttpError, createSession, hashPassword, requireRole, requireUser,
  sessionToken, setSessionCookie, verifyPassword, COOKIE_NAME,
} from '../auth.js';
import { failureLimiter } from '../ratelimit.js';
import { str } from '../validate.js';

export function usersRouter({ db, inviteCode }) {
  const r = Router();
  const loginFailures = failureLimiter({ max: 5, windowMs: 15 * 60e3 });
  const inviteFailures = failureLimiter({ max: 10, windowMs: 15 * 60e3 });

  r.post('/auth/register', (req, res) => {
    const name = str(req.body.name, 'Navn', { max: 80 });
    const email = str(req.body.email, 'E-mail', { max: 200 }).toLowerCase();
    const password = str(req.body.password, 'Adgangskode', { max: 200, trim: false });
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Ugyldig e-mailadresse');
    if (password.length < 8) throw new HttpError(400, 'Adgangskoden skal være mindst 8 tegn');

    const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    // With an invite code configured, everyone needs it – also the first user, who becomes admin.
    if (inviteCode) {
      inviteFailures.check(req.ip);
      if (req.body.inviteCode?.trim() !== inviteCode) {
        inviteFailures.fail(req.ip);
        throw new HttpError(403, 'Forkert klubkode – spørg en træner eller bestyrelsen');
      }
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'Der findes allerede en bruger med den e-mail');
    }

    const role = userCount === 0 ? 'admin' : 'member';
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, email, hashPassword(password), role);
    setSessionCookie(res, createSession(db, Number(lastInsertRowid)));
    res.status(201).json(publicUser(db, lastInsertRowid));
  });

  r.post('/auth/login', (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    loginFailures.check(email);
    const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      loginFailures.fail(email);
      throw new HttpError(401, 'Forkert e-mail eller adgangskode');
    }
    loginFailures.reset(email);
    setSessionCookie(res, createSession(db, row.id));
    res.json(publicUser(db, row.id));
  });

  r.post('/auth/logout', (req, res) => {
    const token = sessionToken(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(204).end();
  });

  r.get('/me', requireUser, (req, res) => res.json(req.user));

  r.patch('/me', requireUser, (req, res) => {
    const name = str(req.body.name ?? req.user.name, 'Navn', { max: 80 });
    const phone = str(req.body.phone ?? req.user.phone ?? '', 'Telefon', { max: 30, required: false });
    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone || null, req.user.id);
    if (req.body.newPassword) {
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
      if (!verifyPassword(String(req.body.currentPassword ?? ''), row.password_hash)) {
        throw new HttpError(400, 'Den nuværende adgangskode er forkert');
      }
      if (String(req.body.newPassword).length < 8) throw new HttpError(400, 'Adgangskoden skal være mindst 8 tegn');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(hashPassword(String(req.body.newPassword)), req.user.id);
    }
    res.json(publicUser(db, req.user.id));
  });

  r.get('/members', requireUser, (_req, res) => {
    res.json(db.prepare('SELECT id, name, email, role, phone FROM users ORDER BY name COLLATE NOCASE').all());
  });

  // Admins can give a member a new password (there is no "forgot password" e-mail).
  r.put('/members/:id/password', requireRole('admin'), (req, res) => {
    const password = str(req.body.password, 'Adgangskode', { max: 200, trim: false });
    if (password.length < 8) throw new HttpError(400, 'Adgangskoden skal være mindst 8 tegn');
    const id = Number(req.params.id);
    const { changes } = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
    if (!changes) throw new HttpError(404, 'Medlemmet findes ikke');
    // Log the member out everywhere, so only the new password works.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    res.status(204).end();
  });

  r.patch('/members/:id', requireRole('admin'), (req, res) => {
    const role = req.body.role;
    if (!['admin', 'coach', 'member'].includes(role)) throw new HttpError(400, 'Ugyldig rolle');
    const id = Number(req.params.id);
    if (id === req.user.id && role !== 'admin') {
      const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
      if (admins <= 1) throw new HttpError(400, 'Klubben skal have mindst én administrator');
    }
    const { changes } = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    if (!changes) throw new HttpError(404, 'Medlemmet findes ikke');
    res.json(publicUser(db, id));
  });

  return r;
}

function publicUser(db, id) {
  return db.prepare('SELECT id, name, email, role, phone FROM users WHERE id = ?').get(id);
}
