import * as StellarSdk from "stellar-sdk";
import { upsertTransaction, upsertEntity, getCursor, setCursor, Transaction } from "./db";

const HORIZON_URL = process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

function extractPaymentInfo(op: StellarSdk.Horizon.ServerApi.OperationRecord): {
  destination: string | null;
  asset_code: string | null;
  asset_issuer: string | null;
  amount: number | null;
} {
  if (op.type === "payment") {
    const p = op as StellarSdk.Horizon.ServerApi.PaymentOperationRecord;
    return {
      destination: p.to,
      asset_code: p.asset_type === "native" ? "XLM" : (p as any).asset_code ?? null,
      asset_issuer: p.asset_type === "native" ? null : (p as any).asset_issuer ?? null,
      amount: parseFloat(p.amount),
    };
  }
  if (op.type === "create_account") {
    const c = op as StellarSdk.Horizon.ServerApi.CreateAccountOperationRecord;
    return {
      destination: c.account,
      asset_code: "XLM",
      asset_issuer: null,
      amount: parseFloat(c.starting_balance),
    };
  }
  return { destination: null, asset_code: null, asset_issuer: null, amount: null };
}

async function processTransaction(tx: StellarSdk.Horizon.ServerApi.TransactionRecord): Promise<void> {
  const ops = await tx.operations();
  for (const op of ops.records) {
    const { destination, asset_code, asset_issuer, amount } = extractPaymentInfo(op);
    const record: Transaction = {
      id: op.id,
      ledger: tx.ledger_attr,
      created_at: tx.created_at,
      source: op.source_account ?? tx.source_account,
      destination,
      asset_code,
      asset_issuer,
      amount,
      type: op.type,
      memo: tx.memo != null ? String(tx.memo) : null,
      fee: tx.fee_charged != null ? parseInt(String(tx.fee_charged)) : null,
      raw: JSON.stringify(op),
    };
    upsertTransaction(record);

    const now = tx.created_at;
    upsertEntity(record.source, now, amount ?? 0, 0);
    if (destination) upsertEntity(destination, now, 0, amount ?? 0);
  }
}

export async function startIndexer(account?: string): Promise<void> {
  const cursor = getCursor();
  console.log(`[indexer] Starting from cursor: ${cursor}`);

  const builder = account
    ? server.transactions().forAccount(account)
    : server.transactions();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream: () => void = (builder as any)
    .cursor(cursor)
    .limit(200)
    .stream({
      onmessage: async (tx: StellarSdk.Horizon.ServerApi.TransactionRecord) => {
        try {
          await processTransaction(tx);
          setCursor(tx.paging_token);
          console.log(`[indexer] Indexed tx ${tx.id} (ledger ${tx.ledger_attr})`);
        } catch (err) {
          console.error(`[indexer] Error processing tx ${tx.id}:`, err);
        }
      },
      onerror: (err: unknown) => {
        console.error("[indexer] Stream error:", err);
      },
    });

  process.on("SIGINT", () => {
    console.log("\n[indexer] Stopping...");
    stream();
    process.exit(0);
  });
}
