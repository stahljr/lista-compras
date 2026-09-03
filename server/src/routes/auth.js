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
import { members, householdOf, householdPorConvite, novoConvite } from '../households.js';

export const authRouter = express.Router();

const PALETTE = ['#0ea5e9', '#ec4899', '#22c55e', '#f59e0b', '#8b5cf6'];

/**
 * Cadastro. O primeiro cadastro de todos cria a primeira casa e vira o
 * administrador. Depois dele, ninguem entra sem um codigo de convite -- e e o
 * codigo que decide em qual casa a pessoa cai. Assim a mae entra na casa dela,
 * com a lista dela, sem ver a sua.
 */
authRouter.post('/register', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const invite = String(req.body?.invite || '');

  if (name.length < 2) return res.status(400).json({ error: 'informe seu nome' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'e-mail invalido' });
  if (password.length < 8) return res.status(400).json({ error: 'a senha precisa ter ao menos 8 caracteres' });

  const userCount = (await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n;
  const primeiro = userCount === 0;

  let casa = null;
  if (!primeiro) {
    casa = await householdPorConvite(invite);
    if (!casa) return res.status(403).json({ error: 'codigo de convite invalido' });
  }

  if (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'este e-mail ja tem conta' });
  }

  if (!casa) {
    casa = await db
      .prepare("INSERT INTO households (name, invite_code) VALUES ('Nossa casa', ?) RETURNING *")
      .get(novoConvite());
  }

  const passwordHash = await hashPassword(password);
  const novo = await db
    .prepare(
      `INSERT INTO users (household_id, name, email, password_hash, color, is_admin)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(casa.id, name, email, passwordHash, PALETTE[userCount % PALETTE.length], primeiro ? 1 : 0);

  const { token, expires } = await createSession(novo.id);
  setSessionCookie(res, token, expires);
  res.json({ user: { id: novo.id, name, email, householdId: casa.id, isAdmin: primeiro } });
});

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Mesma resposta para e-mail inexistente e senha errada.
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!ok) return res.status(401).json({ error: 'e-mail ou senha incorretos' });

  const { token, expires } = await createSession(user.id);
  setSessionCookie(res, token, expires);
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      color: user.color,
      householdId: user.household_id,
      isAdmin: !!user.is_admin,
    },
  });
});

authRouter.post('/logout', async (req, res) => {
  await destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  if (!req.user) {
    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM users').get();
    return res.json({ user: null, needsSetup: n === 0 });
  }
  res.json({
    user: req.user,
    members: await members(req.user.householdId),
    household: await householdOf(req.user.householdId),
  });
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 8) return res.status(400).json({ error: 'a nova senha precisa ter ao menos 8 caracteres' });
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!(await verifyPassword(current, row.password_hash))) return res.status(403).json({ error: 'senha atual incorreta' });
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.user.id);
  res.json({ ok: true });
});
