import { Router, Request, Response } from "express";
import { getDb } from "./db";

const router = Router();

// GET /api/transactions?source=&destination=&asset=&limit=&offset=
router.get("/transactions", (req: Request, res: Response) => {
  const { source, destination, asset, limit = "50", offset = "0" } = req.query as Record<string, string>;
  const db = getDb();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (source)      { conditions.push("source = ?");      params.push(source); }
  if (destination) { conditions.push("destination = ?"); params.push(destination); }
  if (asset)       { conditions.push("asset_code = ?");  params.push(asset); }

  const lim = Math.min(parseInt(limit), 200);
  const off = parseInt(offset);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db.prepare(`
    SELECT * FROM transactions ${where}
    ORDER BY ledger DESC LIMIT ? OFFSET ?
  `).all(...params, lim, off);

  res.json({ data: rows, limit: lim, offset: off });
});

// GET /api/entities?limit=&offset=
router.get("/entities", (req: Request, res: Response) => {
  const { limit = "50", offset = "0" } = req.query as Record<string, string>;
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM entities ORDER BY tx_count DESC LIMIT ? OFFSET ?"
  ).all(parseInt(limit), parseInt(offset));
  res.json({ data: rows });
});

// GET /api/entities/:address
router.get("/entities/:address", (req: Request, res: Response) => {
  const db = getDb();
  const entity = db.prepare("SELECT * FROM entities WHERE address = ?").get(req.params.address);
  if (!entity) return res.status(404).json({ error: "Not found" });
  const txs = db.prepare(`
    SELECT * FROM transactions WHERE source = ? OR destination = ?
    ORDER BY ledger DESC LIMIT 50
  `).all(req.params.address, req.params.address);
  res.json({ entity, transactions: txs });
});

// GET /api/graph?address=&depth=
router.get("/graph", (req: Request, res: Response) => {
  const { address, depth = "2" } = req.query as Record<string, string>;
  const db = getDb();
  const maxDepth = Math.min(parseInt(depth), 3);

  const nodes = new Map<string, Record<string, unknown>>();
  const edges: { source: string; target: string; amount: number; asset: string; count: number }[] = [];
  const edgeMap = new Map<string, number>();

  function explore(addr: string, currentDepth: number): void {
    if (currentDepth > maxDepth || nodes.has(addr)) return;

    const entity = db.prepare("SELECT * FROM entities WHERE address = ?").get(addr) as Record<string, unknown> | undefined;
    nodes.set(addr, entity ?? { address: addr, tx_count: 0, total_sent: 0, total_recv: 0 });

    if (currentDepth === maxDepth) return;

    const txs = db.prepare(`
      SELECT source, destination, SUM(amount) as total_amount, asset_code, COUNT(*) as count
      FROM transactions
      WHERE (source = ? OR destination = ?) AND destination IS NOT NULL
      GROUP BY source, destination, asset_code
    `).all(addr, addr) as Array<Record<string, unknown>>;

    for (const tx of txs) {
      const src = tx.source as string;
      const dst = tx.destination as string;
      const key = `${src}|${dst}|${tx.asset_code}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, edges.length);
        edges.push({ source: src, target: dst, amount: (tx.total_amount as number) ?? 0, asset: (tx.asset_code as string) ?? "XLM", count: tx.count as number });
      }
      explore(src, currentDepth + 1);
      explore(dst, currentDepth + 1);
    }
  }

  if (address) {
    explore(address, 0);
  } else {
    const top = db.prepare("SELECT address FROM entities ORDER BY tx_count DESC LIMIT 20").all() as Array<{ address: string }>;
    for (const e of top) explore(e.address, 0);
  }

  res.json({
    nodes: Array.from(nodes.values()).map(n => ({ ...n, id: n.address })),
    edges,
  });
});

// GET /api/stats
router.get("/stats", (_req: Request, res: Response) => {
  const db = getDb();
  const stats = {
    total_transactions: (db.prepare("SELECT COUNT(*) as c FROM transactions").get() as any).c,
    total_entities:     (db.prepare("SELECT COUNT(*) as c FROM entities").get() as any).c,
    total_volume:       (db.prepare("SELECT SUM(amount) as s FROM transactions WHERE amount IS NOT NULL").get() as any).s ?? 0,
    latest_ledger:      (db.prepare("SELECT MAX(ledger) as l FROM transactions").get() as any).l ?? 0,
  };
  res.json(stats);
});

export default router;
