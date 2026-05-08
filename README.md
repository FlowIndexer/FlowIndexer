# FlowIndexer

An infrastructure layer that aggregates, indexes, and visualizes funding flows and trust networks on the Stellar blockchain. It transforms raw transaction data into queryable APIs and graph visualizations showing who funds whom and how value moves through networks.

## Features

- Streams and indexes Stellar transactions in real time via Horizon
- Persists transactions and entity stats to a local SQLite database
- REST API for querying transactions, entities, and flow graphs
- Built-in dashboard UI served at `/`

## Requirements

- Node.js 22+ (uses the built-in `node:sqlite` module)

## Setup

```bash
npm install
npm run build
```

## Running

**Start the API server** (default port 3000):
```bash
npm start
```

**Start the indexer** (streams transactions from Stellar):
```bash
npm run index
```

To index a specific account only:
```bash
STELLAR_ACCOUNT=G... npm run index
```

To use a custom Horizon instance:
```bash
HORIZON_URL=https://horizon-testnet.stellar.org npm run index
```

**Development mode** (no build step):
```bash
npm run dev
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List transactions. Query: `source`, `destination`, `asset`, `limit`, `offset` |
| GET | `/api/entities` | List entities ranked by activity. Query: `limit`, `offset` |
| GET | `/api/entities/:address` | Entity detail with recent transactions |
| GET | `/api/graph` | Flow graph. Query: `address`, `depth` (max 3) |
| GET | `/api/stats` | Aggregate stats: tx count, entity count, volume, latest ledger |

## Dashboard

Open `http://localhost:3000` in a browser to view the built-in dashboard.

## Architecture

```
Stellar Horizon ──stream──▶ indexer.ts ──▶ SQLite (flowindex.db)
                                                    │
                                          routes.ts ◀─ Express API ◀─ clients
```

- `src/indexer.ts` — Horizon stream consumer, processes and stores transactions
- `src/db.ts` — SQLite schema and data access layer
- `src/routes.ts` — Express REST API
- `src/index.ts` — Server entry point
- `src/public/dashboard.html` — Frontend dashboard
