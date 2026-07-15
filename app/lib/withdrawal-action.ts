"use server";

import { readFileSync } from "node:fs";
import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, VAULT, newConnection } from "./surety-client.js";

// WithdrawalRequest is a fixed 130 bytes (8 discriminator + 32 vault + 32 lp +
// 32 share_account + 8 request_id + 8 shares + 8 unlock_ts + 1 bump + 1 status),
// a size no other account in this program shares — scoping by dataSize alone is
// enough to isolate withdrawal requests without needing a base58-encoded
// discriminator memcmp filter.
const WITHDRAWAL_REQUEST_SIZE = 130;

export type WithdrawalRequestView = {
  address: string;
  requestId: string;
  shares: string;
  unlockTs: string;
  status: "Pending" | "Executed";
};

export async function listWithdrawalRequests(lp: string): Promise<WithdrawalRequestView[]> {
  const owner = new PublicKey(lp);
  const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as Idl;
  const coder = new BorshAccountsCoder(idl);
  const connection = newConnection();

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: WITHDRAWAL_REQUEST_SIZE }],
  });

  const requests: WithdrawalRequestView[] = [];
  for (const { pubkey, account } of accounts) {
    let decoded: Record<string, unknown>;
    try {
      decoded = coder.decode("WithdrawalRequest", account.data) as Record<string, unknown>;
    } catch {
      continue;
    }
    const vault = decoded.vault as PublicKey;
    const requestLp = decoded.lp as PublicKey;
    if (!vault.equals(VAULT) || !requestLp.equals(owner)) continue;
    const status = decoded.status as { pending?: object; executed?: object };
    requests.push({
      address: pubkey.toBase58(),
      requestId: String(decoded.requestId),
      shares: String(decoded.shares),
      unlockTs: String(decoded.unlockTs),
      status: status.executed ? "Executed" : "Pending",
    });
  }
  return requests.sort((a, b) => Number(a.requestId) - Number(b.requestId));
}
