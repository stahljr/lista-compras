import crypto from 'node:crypto';
import { db } from './db.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 180;
export const COOKIE_NAME = 'lc_session';

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, { N: +N, r: +r, p: +p }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expires.toISOString().replace('T', ' ').slice(0, 19),
  );
  return { token, expires };
}

export async function destroySession(token) {
  if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// O apelido vai entre aspas: sem elas o Postgres devolveria "householdid", e a
// sessao passaria a nao saber de que casa e o usuario.
const selectSessionUser = () =>
  db.prepare(`
    SELECT u.id, u.name, u.email, u.color, u.household_id AS "householdId"
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')
  `);

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/**
 * Populates req.user when a valid session cookie is present. Cookie ausente ou
 * invalido nao e erro; falha de banco e.
 */
export async function attachUser(req, _res, next) {
  const token = readCookie(req, COOKIE_NAME);
  req.sessionToken = token;
  try {
    req.user = token ? (await selectSessionUser().get(token)) || null : null;
  } catch (err) {
    // Banco fora do ar nao pode virar "sem sessao" silencioso: sem isso, a
    // tela de login apareceria como se a conta nao existisse.
    return next(err);
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'nao autenticado' });
  next();
}

export function setSessionCookie(res, token, expires) {
  const secure = process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1';
  res.setHeader(
    'Set-Cookie',
    [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Expires=${expires.toUTCString()}`,
      secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; '),
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function purgeExpiredSessions() {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}
