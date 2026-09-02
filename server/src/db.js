import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'lista.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS households (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id  INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#0ea5e9',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------------------------------------------------------------- catalogo
-- Um produto e a nocao "abstrata" do item: agrupa as ofertas dos mercados.
-- Produtos com EAN sao unificados por EAN; sem EAN, por nome normalizado.
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ean        TEXT UNIQUE,
  match_key  TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  brand      TEXT,
  category   TEXT NOT NULL DEFAULT 'Outros',
  image_url  TEXT,
  unit       TEXT NOT NULL DEFAULT 'un',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

CREATE TABLE IF NOT EXISTS offers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  market       TEXT NOT NULL,
  market_sku   TEXT NOT NULL,
  name         TEXT NOT NULL,
  price        REAL,
  list_price   REAL,
  available    INTEGER NOT NULL DEFAULT 1,
  url          TEXT,
  image_url    TEXT,
  category     TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(market, market_sku)
);
CREATE INDEX IF NOT EXISTS idx_offers_product ON offers(product_id);
CREATE INDEX IF NOT EXISTS idx_offers_market ON offers(market);

-- Cache das buscas por termo, para nao bater nos sites a cada tecla.
CREATE TABLE IF NOT EXISTS search_cache (
  market     TEXT NOT NULL,
  term       TEXT NOT NULL,
  product_ids TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (market, term)
);

-- ------------------------------------------------------------------ listas
-- Toda lista e preparacao: e nela que se anota o que precisa comprar.
-- kind: 'general' -> a lista geral, uma por casa, para a proxima compra
--       'quick'   -> lista nomeada (limpeza, churrasco, o que faltou...)
-- reusable: lista rapida cadastrada continua existindo depois de usada; a
-- lista geral e as de sobra sao de uso unico e o carrinho as consome.
CREATE TABLE IF NOT EXISTS lists (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'quick',
  reusable     INTEGER NOT NULL DEFAULT 1,
  emoji        TEXT NOT NULL DEFAULT '🛒',
  archived     INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lists_household ON lists(household_id, kind);

CREATE TABLE IF NOT EXISTS list_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id    INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  qty        REAL NOT NULL DEFAULT 1,
  unit       TEXT NOT NULL DEFAULT 'un',
  category   TEXT NOT NULL DEFAULT 'Outros',
  image_url  TEXT,
  note       TEXT,
  position   REAL NOT NULL DEFAULT 0,
  added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);

-- ------------------------------------------------------------------ compras
-- Uma "trip" e uma ida ao mercado: nasce de uma lista, e durante ela se
-- marca o que ja foi pego e se anota o preco real.
CREATE TABLE IF NOT EXISTS trips (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  list_id      INTEGER REFERENCES lists(id) ON DELETE SET NULL,
  list_name    TEXT NOT NULL DEFAULT 'Compra',
  market       TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  started_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_trips_household ON trips(household_id, status);

CREATE TABLE IF NOT EXISTS trip_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id      INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  list_item_id INTEGER REFERENCES list_items(id) ON DELETE SET NULL,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  qty          REAL NOT NULL DEFAULT 1,
  unit         TEXT NOT NULL DEFAULT 'un',
  category     TEXT NOT NULL DEFAULT 'Outros',
  image_url    TEXT,
  note         TEXT,
  picked       INTEGER NOT NULL DEFAULT 0,
  unit_price   REAL,
  picked_qty   REAL,
  picked_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  picked_at    TEXT,
  expected     REAL
);
CREATE INDEX IF NOT EXISTS idx_trip_items_trip ON trip_items(trip_id);

-- Historico de precos pagos de verdade, alimentado ao fechar cada compra.
CREATE TABLE IF NOT EXISTS price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
  match_key   TEXT NOT NULL,
  name        TEXT NOT NULL,
  market      TEXT,
  unit_price  REAL NOT NULL,
  trip_id     INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_price_history_key ON price_history(match_key, recorded_at);
`);

/**
 * Colunas acrescentadas depois que ja havia banco em uso. SQLite nao tem
 * "ADD COLUMN IF NOT EXISTS", entao a existencia e conferida antes.
 */
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Preco de cada mercado no momento em que o item entrou na lista. E este o
// numero que vale no mercado: quem esta com o carrinho na mao nao quer que o
// app saia consultando preco novo -- a decisao de onde comprar ja foi tomada.
addColumn('list_items', 'price_snapshot', 'TEXT');
addColumn('list_items', 'snapshot_at', 'TEXT');
addColumn('lists', 'reusable', 'INTEGER NOT NULL DEFAULT 1');
addColumn('trip_items', 'source_list_id', 'INTEGER');

// Nomes antigos: o "carrinho" era uma lista, antes de o carrinho passar a ser
// a ida ao mercado montada a partir de uma ou mais listas.
db.exec(`
  UPDATE lists SET kind = 'general', reusable = 0 WHERE kind = 'cart';
  UPDATE lists SET kind = 'quick'                 WHERE kind = 'template';
  UPDATE lists SET reusable = 0 WHERE kind = 'general';
  UPDATE lists SET name = 'Lista geral', emoji = '📝' WHERE kind = 'general' AND name = 'Carrinho';
`);

// Um carrinho e montado de uma ou mais listas, e guarda de quais veio: no
// fecho e isso que diz o que consumir e o que deixar cadastrado.
// trip_item_sources amarra cada item do carrinho aos itens de lista que o
// originaram -- plural, porque o mesmo produto pode vir de duas listas e virar
// uma linha so. Sem esse rastro, o fecho nao sabe o que saiu de onde.
db.exec(`
CREATE TABLE IF NOT EXISTS trip_lists (
  trip_id   INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  list_id   INTEGER REFERENCES lists(id) ON DELETE SET NULL,
  list_name TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'quick',
  reusable  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (trip_id, list_id)
);

CREATE TABLE IF NOT EXISTS trip_item_sources (
  trip_item_id INTEGER NOT NULL REFERENCES trip_items(id) ON DELETE CASCADE,
  list_item_id INTEGER NOT NULL,
  list_id      INTEGER,
  PRIMARY KEY (trip_item_id, list_item_id)
);
CREATE INDEX IF NOT EXISTS idx_trip_item_sources_item ON trip_item_sources(trip_item_id);
`);

// Chave/valor para controle interno (versao do classificador, por exemplo).
db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

export function metaGet(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function metaSet(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value),
  );
}

export function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
