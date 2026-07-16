import { AnchorProvider, Wallet } from "@anchor-lang/core";
import type { Connection, Keypair, Transaction } from "@solana/web3.js";
import { loadDeployer } from "../../../app/lib/deployer.js";
import { validatedFixturePda } from "../../../app/lib/pda.js";
import { getProgram, newConnection } from "../../../app/lib/surety-client.js";
import {
  createTxlineSession,
  fetchFixtureProof,
  fetchFixtureSnapshot,
  fetchLatestFullMatchOdds,
  fetchOddsProof,
  preserveAuthenticArtifact,
} from "./live.js";
import {
  buildRecordValidatedFixtureTx,
  buildRecordValidatedOddsTx,
  validatedOddsAddress,
} from "./record.js";
import { validateFixtureOnDevnet, validateOddsOnDevnet } from "./txline.js";

export type SyncOptions = {
  connection?: Connection;
  payer?: Keypair;
  preserve?: boolean;
};

async function submit(connection: Connection, payer: Keypair, transaction: Transaction): Promise<{ signature: string; bytes: number }> {
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.sign(payer);
  const wire = transaction.serialize();
  if (wire.length > 1_232) throw new Error(`validation receipt transaction is ${wire.length} bytes (maximum 1232)`);
  const signature = await connection.sendRawTransaction(wire, { maxRetries: 5 });
  const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (result.value.err) throw new Error(`validation receipt ${signature} failed: ${JSON.stringify(result.value.err)}`);
  return { signature, bytes: wire.length };
}

export async function syncValidatedMarket(fixtureId: bigint, options: SyncOptions = {}) {
  const connection = options.connection ?? newConnection();
  const payer = options.payer ?? loadDeployer();
  const txlineProvider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = getProgram(connection, { publicKey: payer.publicKey });
  const session = await createTxlineSession();
  const fixtureAddress = validatedFixturePda(fixtureId);
  let fixtureReceipt = await program.account.validatedFixture.fetchNullable(fixtureAddress);
  let fixtureTransaction: { signature: string; bytes: number } | null = null;
  let fixtureProofTimestamp: number | null = null;

  if (!fixtureReceipt) {
    const fixture = await fetchFixtureSnapshot(session, fixtureId);
    const fixtureProof = await fetchFixtureProof(session, fixture);
    if (!(await validateFixtureOnDevnet(txlineProvider, fixtureProof.proof))) {
      throw new Error("TxLINE validate_fixture returned false");
    }
    fixtureTransaction = await submit(
      connection,
      payer,
      await buildRecordValidatedFixtureTx(connection, payer.publicKey, fixtureProof.proof),
    );
    fixtureReceipt = await program.account.validatedFixture.fetch(fixtureAddress);
    fixtureProofTimestamp = fixture.Ts;
    if (options.preserve) {
      await preserveAuthenticArtifact(`txline-${fixtureId}-${fixture.Ts}-fixture-proof.raw.json`, fixtureProof.bytes);
    }
  }

  const odds = await fetchLatestFullMatchOdds(session, fixtureId);
  const age = Date.now() - odds.packet.Ts;
  if (age > 15 * 60 * 1_000 || age < -30 * 1_000) {
    throw new Error(`latest TxLINE odds packet is outside the on-chain freshness window (${age}ms old)`);
  }
  const oddsProof = await fetchOddsProof(session, odds.packet);
  if (!(await validateOddsOnDevnet(txlineProvider, oddsProof.proof))) {
    throw new Error("TxLINE validate_odds returned false");
  }
  const oddsAddress = validatedOddsAddress(oddsProof.proof);
  let oddsReceipt = await program.account.validatedOdds.fetchNullable(oddsAddress);
  let oddsTransaction: { signature: string; bytes: number } | null = null;
  if (!oddsReceipt) {
    oddsTransaction = await submit(
      connection,
      payer,
      await buildRecordValidatedOddsTx(connection, payer.publicKey, oddsProof.proof),
    );
    oddsReceipt = await program.account.validatedOdds.fetch(oddsAddress);
  }
  if (options.preserve) {
    await preserveAuthenticArtifact(`txline-${fixtureId}-${odds.packet.Ts}-odds-snapshot.raw.json`, odds.snapshotBytes);
    await preserveAuthenticArtifact(`txline-${fixtureId}-${odds.packet.Ts}-odds-proof.raw.json`, oddsProof.bytes);
  }

  return {
    packet: odds.packet,
    snapshotBytes: odds.snapshotBytes,
    fixtureAddress,
    oddsAddress,
    fixtureReceipt,
    oddsReceipt,
    fixtureProofTimestamp,
    fixtureTransaction,
    oddsTransaction,
  };
}
