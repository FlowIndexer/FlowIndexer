// Uses the built-in node:sqlite module (Node 22+)
import { DatabaseSync } from "node:sqlite";
import path from "path";

const DB_PATH = path.join(process.cwd(), "flowindex.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id          TEXT PRIMARY KEY,
      ledger      INTEGER NOT NULL,
      created_at  TEXT NOT NULL,
      source      TEXT NOT NULL,
      destination TEXT,
      asset_code  TEXT,
      asset_issuer TEXT,
      amount      REAL,
      type        TEXT NOT NULL,
      memo        TEXT,
      fee         INTEGER,
      raw         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tx_source      ON transactions(source);
    CREATE INDEX IF NOT EXISTS idx_tx_destination ON transactions(destination);
    CREATE INDEX IF NOT EXISTS idx_tx_ledger      ON transactions(ledger);

    CREATE TABLE IF NOT EXISTS entities (
      address     TEXT PRIMARY KEY,
      first_seen  TEXT NOT NULL,
      last_seen   TEXT NOT NULL,
      tx_count    INTEGER NOT NULL DEFAULT 0,
      total_sent  REAL NOT NULL DEFAULT 0,
      total_recv  REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cursor_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export interface Transaction {
  id: string;
  ledger: number;
  created_at: string;
  source: string;
  destination: string | null;
  asset_code: string | null;
  asset_issuer: string | null;
  amount: number | null;
  type: string;
  memo: string | null;
  fee: number | null;
  raw: string;
}

export function upsertTransaction(tx: Transaction): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO transactions
      (id, ledger, created_at, source, destination, asset_code, asset_issuer, amount, type, memo, fee, raw)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tx.id, tx.ledger, tx.created_at, tx.source, tx.destination,
    tx.asset_code, tx.asset_issuer, tx.amount, tx.type, tx.memo, tx.fee, tx.raw
  );
}

export function upsertEntity(address: string, now: string, sent: number, recv: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO entities (address, first_seen, last_seen, tx_count, total_sent, total_recv)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      last_seen  = excluded.last_seen,
      tx_count   = tx_count + 1,
      total_sent = total_sent + excluded.total_sent,
      total_recv = total_recv + excluded.total_recv
  `).run(address, now, now, sent, recv);
}

export function getCursor(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM cursor_state WHERE key = 'cursor'").get() as { value: string } | undefined;
  return row?.value ?? "now";
}

export function setCursor(cursor: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO cursor_state (key, value) VALUES ('cursor', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(cursor);
}
