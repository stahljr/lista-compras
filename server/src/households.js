import { db } from './db.js';

/**
 * A lista geral: uma por casa, sempre presente, para a proxima compra. E de
 * uso unico -- quando o carrinho a leva, ela e esvaziada.
 */
export function getGeneralList(householdId) {
  let list = db.prepare("SELECT * FROM lists WHERE household_id = ? AND kind = 'general'").get(householdId);
  if (!list) {
    const info = db
      .prepare("INSERT INTO lists (household_id, name, kind, emoji, reusable) VALUES (?, 'Lista geral', 'general', '📝', 0)")
      .run(householdId);
    list = db.prepare('SELECT * FROM lists WHERE id = ?').get(info.lastInsertRowid);
  }
  return list;
}

export function assertListInHousehold(listId, householdId) {
  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND household_id = ?').get(listId, householdId);
  if (!list) {
    const err = new Error('lista nao encontrada');
    err.status = 404;
    throw err;
  }
  return list;
}

export function assertTripInHousehold(tripId, householdId) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND household_id = ?').get(tripId, householdId);
  if (!trip) {
    const err = new Error('carrinho nao encontrado');
    err.status = 404;
    throw err;
  }
  return trip;
}

export function members(householdId) {
  return db.prepare('SELECT id, name, color FROM users WHERE household_id = ? ORDER BY id').all(householdId);
}
