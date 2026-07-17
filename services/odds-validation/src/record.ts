import { BN } from "@anchor-lang/core";
import { ComputeBudgetProgram, type Connection, PublicKey, SystemProgram, type Transaction } from "@solana/web3.js";
import { TXLINE_PROGRAM_ID } from "../../../app/lib/config.js";
import {
  dailyOddsMerkleRootsPda,
  tenDailyFixturesRootsPda,
  validatedFixturePda,
  validatedOddsPda,
} from "../../../app/lib/pda.js";
import { getProgram } from "../../../app/lib/surety-client.js";
import {
  oddsMessageKey,
  pureFixtureId,
  type RawFixtureValidation,
  type RawOddsValidation,
  suretyFixtureValidationInput,
  suretyOddsValidationInput,
} from "@surety-tx/txline-verify";

export function validatedFixtureAddress(proof: RawFixtureValidation): PublicKey {
  return validatedFixturePda(pureFixtureId(proof.snapshot.FixtureId));
}

export async function buildRecordValidatedFixtureTx(
  connection: Connection,
  payer: PublicKey,
  proof: RawFixtureValidation,
): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: payer });
  const fixtureId = pureFixtureId(proof.snapshot.FixtureId);
  return program.methods
    .recordValidatedFixture(new BN(fixtureId.toString()), suretyFixtureValidationInput(proof))
    .accountsStrict({
      payer,
      validatedFixture: validatedFixturePda(fixtureId),
      txlineProgram: TXLINE_PROGRAM_ID,
      tenDailyFixturesRoots: tenDailyFixturesRootsPda(proof.snapshot.Ts),
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })])
    .transaction();
}

export function validatedOddsAddress(proof: RawOddsValidation): PublicKey {
  return validatedOddsPda(oddsMessageKey(proof.odds.MessageId));
}

export async function buildRecordValidatedOddsTx(
  connection: Connection,
  payer: PublicKey,
  proof: RawOddsValidation,
): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: payer });
  const messageKey = oddsMessageKey(proof.odds.MessageId);
  return program.methods
    .recordValidatedOdds([...messageKey], suretyOddsValidationInput(proof))
    .accountsStrict({
      payer,
      validatedOdds: validatedOddsPda(messageKey),
      txlineProgram: TXLINE_PROGRAM_ID,
      dailyOddsMerkleRoots: dailyOddsMerkleRootsPda(proof.odds.Ts),
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .transaction();
}
