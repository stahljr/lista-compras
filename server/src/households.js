import crypto from 'node:crypto';
import { db } from './db.js';

/**
 * A lista geral: uma por casa, sempre presente, para a proxima compra. E de
 * uso unico -- quando o carrinho a leva, ela e esvaziada.
 */
export async function getGeneralList(householdId) {
  let list = await db.prepare("SELECT * FROM lists WHERE household_id = ? AND kind = 'general'").get(householdId);
  if (!list) {
    const nova = await db
      .prepare(
        `INSERT INTO lists (household_id, name, kind, emoji, reusable)
         VALUES (?, 'Lista geral', 'general', '📝', 0) RETURNING id`,
      )
      .get(householdId);
    list = await db.prepare('SELECT * FROM lists WHERE id = ?').get(nova.id);
  }
  return list;
}

export async function assertListInHousehold(listId, householdId) {
  const list = await db.prepare('SELECT * FROM lists WHERE id = ? AND household_id = ?').get(listId, householdId);
  if (!list) {
    const err = new Error('lista nao encontrada');
    err.status = 404;
    throw err;
  }
  return list;
}

export async function assertTripInHousehold(tripId, householdId) {
  const trip = await db.prepare('SELECT * FROM trips WHERE id = ? AND household_id = ?').get(tripId, householdId);
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

export function householdOf(householdId) {
  return db.prepare('SELECT id, name FROM households WHERE id = ?').get(householdId);
}

// Alfabeto sem os parecidos (I, l, O, 0, 1): o codigo vai ser lido em voz alta
// ou digitado no celular de outra pessoa.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Codigo de convite novo, no formato XXXX-XXXX. */
export function novoConvite() {
  const bytes = crypto.randomBytes(8);
  const letras = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]);
  return `${letras.slice(0, 4).join('')}-${letras.slice(4).join('')}`;
}

/** Compara convite digitado com o guardado, sem ligar para caixa nem espaco. */
export const normalizaConvite = (codigo) => String(codigo || '').trim().toUpperCase().replace(/\s+/g, '');

/**
 * A casa a que este convite dá acesso. Aceita tambem o INVITE_CODE do
 * servidor, que era o convite unico de antes das familias: quem ja tinha esse
 * codigo continua entrando na primeira casa.
 */
export async function householdPorConvite(codigo) {
  const alvo = normalizaConvite(codigo);
  if (!alvo) return null;

  const casa = await db
    .prepare('SELECT * FROM households WHERE invite_code IS NOT NULL AND upper(invite_code) = ?')
    .get(alvo);
  if (casa) return casa;

  const doServidor = normalizaConvite(process.env.INVITE_CODE);
  if (doServidor && alvo === doServidor) {
    return db.prepare('SELECT * FROM households ORDER BY id LIMIT 1').get();
  }
  return null;
}
