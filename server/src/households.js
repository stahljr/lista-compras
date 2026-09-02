import { db } from './db.js';

/** Cada casa tem exatamente um carrinho; ele e criado na primeira vez que precisa. */
export function getCart(householdId) {
  let cart = db.prepare("SELECT * FROM lists WHERE household_id = ? AND kind = 'cart'").get(householdId);
  if (!cart) {
    const info = db
      .prepare("INSERT INTO lists (household_id, name, kind, emoji) VALUES (?, 'Carrinho', 'cart', '🛒')")
      .run(householdId);
    cart = db.prepare('SELECT * FROM lists WHERE id = ?').get(info.lastInsertRowid);
  }
  return cart;
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
    const err = new Error('compra nao encontrada');
    err.status = 404;
    throw err;
  }
  return trip;
}

export function members(householdId) {
  return db.prepare('SELECT id, name, color FROM users WHERE household_id = ? ORDER BY id').all(householdId);
}
