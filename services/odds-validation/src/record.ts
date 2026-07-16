import { ComputeBudgetProgram, type Connection, PublicKey, SystemProgram, type Transaction } from "@solana/web3.js";
import { TXLINE_PROGRAM_ID } from "../../../app/lib/config.js";
import { dailyOddsMerkleRootsPda, validatedOddsPda } from "../../../app/lib/pda.js";
import { getProgram } from "../../../app/lib/surety-client.js";
import {
  oddsMessageKey,
  type RawOddsValidation,
  suretyOddsValidationInput,
} from "./txline.js";

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
