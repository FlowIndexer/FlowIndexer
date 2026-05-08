import { startIndexer } from "./indexer";

const account = process.env.STELLAR_ACCOUNT;
startIndexer(account).catch(console.error);
