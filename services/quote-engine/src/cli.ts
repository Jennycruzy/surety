import { readFileSync } from "node:fs";
import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  auditQuote,
  type BookState,
  type Quote,
  type QuoteRequest,
  type TxlineWinnerPacket,
} from "./engine.js";

export type StoredQuoteRequest = Omit<QuoteRequest, "coverage" | "book"> & {
  coverage: string;
  book: Omit<BookState, "totalCapital" | "freeReserves" | "lockedLiabilities" | "bucketExposure"> & {
    totalCapital: string;
    freeReserves: string;
    lockedLiabilities: string;
    bucketExposure: string;
  };
};

export type QuoteAuditRecord = {
  policy: string;
  request: StoredQuoteRequest;
  quote: Quote;
};

export function storeRequest(request: QuoteRequest): StoredQuoteRequest {
  return {
    packet: request.packet,
    packetSourceSha256: request.packetSourceSha256,
    predicateHash: request.predicateHash,
    outcome: request.outcome,
    coverage: request.coverage.toString(),
    marginBps: request.marginBps,
    book: {
      ...request.book,
      totalCapital: request.book.totalCapital.toString(),
      freeReserves: request.book.freeReserves.toString(),
      lockedLiabilities: request.book.lockedLiabilities.toString(),
      bucketExposure: request.book.bucketExposure.toString(),
    },
  };
}

function loadRequest(request: StoredQuoteRequest): QuoteRequest {
  return {
    ...request,
    packet: request.packet as TxlineWinnerPacket,
    coverage: BigInt(request.coverage),
    book: {
      ...request.book,
      totalCapital: BigInt(request.book.totalCapital),
      freeReserves: BigInt(request.book.freeReserves),
      lockedLiabilities: BigInt(request.book.lockedLiabilities),
      bucketExposure: BigInt(request.book.bucketExposure),
    },
  };
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const logPath = argument("--log");
  if (!logPath) throw new Error("usage: audit-quote --log <jsonl> [--policy <address>] [--rpc <url>]");
  const requestedPolicy = argument("--policy");
  const records = readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as QuoteAuditRecord)
    .filter((record) => !requestedPolicy || record.policy === requestedPolicy);
  if (records.length === 0) throw new Error("no matching quote records");

  const rpc = argument("--rpc");
  let connection: Connection | undefined;
  let coder: BorshAccountsCoder | undefined;
  if (rpc) {
    connection = new Connection(rpc, "confirmed");
    const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as Idl;
    coder = new BorshAccountsCoder(idl);
  }
  for (const record of records) {
    const quote = auditQuote(loadRequest(record.request), record.quote);
    if (connection && coder) {
      const account = await connection.getAccountInfo(new PublicKey(record.policy), "confirmed");
      if (!account) throw new Error(`policy ${record.policy} does not exist on-chain`);
      const policy = coder.decode("Policy", account.data) as {
        quoteHash?: number[];
        quote_hash?: number[];
      };
      const storedHash = policy.quoteHash ?? policy.quote_hash;
      if (!storedHash) throw new Error(`policy ${record.policy} decoded without quote_hash`);
      const onChainHash = Buffer.from(storedHash).toString("hex");
      if (onChainHash !== quote.quoteHash) {
        throw new Error(`policy ${record.policy} on-chain hash ${onChainHash} != ${quote.quoteHash}`);
      }
    }
    console.log(`PASS: ${record.policy} quote ${quote.quoteHash} recomputes exactly${rpc ? " and matches on-chain" : ""}`);
  }
  console.log(`PASS: audited ${records.length} quote commitment${records.length === 1 ? "" : "s"}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
