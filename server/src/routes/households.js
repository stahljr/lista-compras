import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { novoConvite } from '../households.js';

export const householdsRouter = express.Router();
householdsRouter.use(requireAuth);

/**
 * As casas (familias) e quem administra.
 *
 * Cada casa e uma fronteira: lista, carrinho e historico ficam dentro dela, e
 * nenhuma tela atravessa essa linha. O administrador cria as casas e distribui
 * os convites -- e so isso. Ele nao ve a lista das outras, nem elas a dele; a
 * separacao vale para todo mundo, inclusive para quem administra.
 */
function soAdmin(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'so o administrador mexe nas familias' });
  next();
}

householdsRouter.get('/', soAdmin, async (_req, res, next) => {
  try {
    const casas = await db
      .prepare(
        `SELECT h.id, h.name, h.invite_code, h.created_at,
                (SELECT COUNT(*) FROM lists l WHERE l.household_id = h.id) AS listas
           FROM households h
          ORDER BY h.id`,
      )
      .all();
    const pessoas = await db
      .prepare('SELECT id, household_id, name, email, color, (is_admin = 1) AS admin FROM users ORDER BY id')
      .all();
    res.json({
      households: casas.map((h) => ({
        id: h.id,
        name: h.name,
        inviteCode: h.invite_code,
        listCount: Number(h.listas),
        members: pessoas
          .filter((p) => p.household_id === h.id)
          .map((p) => ({ id: p.id, name: p.name, email: p.email, color: p.color, admin: !!p.admin })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Cria uma casa nova, ja com convite pronto para passar para alguem. */
householdsRouter.post('/', soAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'de um nome para a familia' });
    const casa = await db
      .prepare('INSERT INTO households (name, invite_code) VALUES (?, ?) RETURNING *')
      .get(name, novoConvite());
    res.json({ household: { id: casa.id, name: casa.name, inviteCode: casa.invite_code, members: [], listCount: 0 } });
  } catch (err) {
    next(err);
  }
});

householdsRouter.patch('/:id', soAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'de um nome para a familia' });
    const casa = await db
      .prepare('UPDATE households SET name = ? WHERE id = ? RETURNING id, name, invite_code')
      .get(name, Number(req.params.id));
    if (!casa) return res.status(404).json({ error: 'familia nao encontrada' });
    res.json({ household: { id: casa.id, name: casa.name, inviteCode: casa.invite_code } });
  } catch (err) {
    next(err);
  }
});

/** Gera um convite novo (o anterior deixa de valer na hora). */
householdsRouter.post('/:id/invite', soAdmin, async (req, res, next) => {
  try {
    const casa = await db
      .prepare('UPDATE households SET invite_code = ? WHERE id = ? RETURNING id, invite_code')
      .get(novoConvite(), Number(req.params.id));
    if (!casa) return res.status(404).json({ error: 'familia nao encontrada' });
    res.json({ id: casa.id, inviteCode: casa.invite_code });
  } catch (err) {
    next(err);
  }
});

/** Fecha a casa para novos cadastros. */
householdsRouter.delete('/:id/invite', soAdmin, async (req, res, next) => {
  try {
    const casa = await db
      .prepare('UPDATE households SET invite_code = NULL WHERE id = ? RETURNING id')
      .get(Number(req.params.id));
    if (!casa) return res.status(404).json({ error: 'familia nao encontrada' });
    res.json({ id: casa.id, inviteCode: null });
  } catch (err) {
    next(err);
  }
});

/**
 * Apaga uma casa -- so se ela estiver sem ninguem. Apagar uma casa com gente
 * dentro levaria as listas dessas pessoas junto, e isso nao pode ser um toque
 * a mais na tela de quem administra.
 */
householdsRouter.delete('/:id', soAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE household_id = ?').get(id);
    if (n > 0) return res.status(409).json({ error: 'esta familia tem gente dentro; mova as pessoas antes' });
    await db.prepare('DELETE FROM households WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Move uma pessoa de casa -- para quando alguem usou o convite errado. */
householdsRouter.patch('/users/:userId', soAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const householdId = Number(req.body?.householdId);
    if (userId === req.user.id) return res.status(400).json({ error: 'nao da para mudar a sua propria casa por aqui' });
    const casa = await db.prepare('SELECT id FROM households WHERE id = ?').get(householdId);
    if (!casa) return res.status(404).json({ error: 'familia nao encontrada' });
    const pessoa = await db
      .prepare('UPDATE users SET household_id = ? WHERE id = ? RETURNING id, name, household_id')
      .get(householdId, userId);
    if (!pessoa) return res.status(404).json({ error: 'pessoa nao encontrada' });
    res.json({ user: { id: pessoa.id, name: pessoa.name, householdId: pessoa.household_id } });
  } catch (err) {
    next(err);
  }
});
