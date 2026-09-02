import express from 'express';
import { db } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from '../auth.js';
import { members } from '../households.js';

export const authRouter = express.Router();

const PALETTE = ['#0ea5e9', '#ec4899', '#22c55e', '#f59e0b', '#8b5cf6'];

/**
 * Cadastro. O primeiro cadastro cria a casa; do segundo em diante e preciso
 * o codigo de convite (INVITE_CODE), para o app nao ficar aberto na internet.
 */
authRouter.post('/register', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const invite = String(req.body?.invite || '');

  if (name.length < 2) return res.status(400).json({ error: 'informe seu nome' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'e-mail invalido' });
  if (password.length < 8) return res.status(400).json({ error: 'a senha precisa ter ao menos 8 caracteres' });

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const expected = process.env.INVITE_CODE;
  if (userCount > 0) {
    if (!expected) return res.status(403).json({ error: 'cadastro fechado: defina INVITE_CODE no servidor' });
    if (invite !== expected) return res.status(403).json({ error: 'codigo de convite invalido' });
  }

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'este e-mail ja tem conta' });
  }

  let householdId = db.prepare('SELECT id FROM households ORDER BY id LIMIT 1').get()?.id;
  if (!householdId) {
    householdId = db.prepare("INSERT INTO households (name) VALUES ('Casa')").run().lastInsertRowid;
  }

  const passwordHash = await hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (household_id, name, email, password_hash, color) VALUES (?, ?, ?, ?, ?)')
    .run(householdId, name, email, passwordHash, PALETTE[userCount % PALETTE.length]);

  const { token, expires } = createSession(info.lastInsertRowid);
  setSessionCookie(res, token, expires);
  res.json({ user: { id: info.lastInsertRowid, name, email, householdId } });
});

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Mesma resposta para e-mail inexistente e senha errada.
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!ok) return res.status(401).json({ error: 'e-mail ou senha incorretos' });

  const { token, expires } = createSession(user.id);
  setSessionCookie(res, token, expires);
  res.json({ user: { id: user.id, name: user.name, email: user.email, color: user.color, householdId: user.household_id } });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null, needsSetup: db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0 });
  res.json({ user: req.user, members: members(req.user.householdId) });
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 8) return res.status(400).json({ error: 'a nova senha precisa ter ao menos 8 caracteres' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!(await verifyPassword(current, row.password_hash))) return res.status(403).json({ error: 'senha atual incorreta' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.user.id);
  res.json({ ok: true });
});
