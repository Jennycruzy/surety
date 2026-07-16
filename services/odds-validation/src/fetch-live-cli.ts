import { AnchorProvider, setProvider } from "@anchor-lang/core";
import {
  createTxlineSession,
  fetchFixtureProof,
  fetchFixtureSnapshot,
  fetchLatestFullMatchOdds,
  fetchOddsProof,
  preserveAuthenticArtifact,
} from "./live.js";
import { validateFixtureOnDevnet, validateOddsOnDevnet } from "./txline.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const fixtureId = BigInt(argument("--fixture") ?? process.env.NEXT_PUBLIC_SURETY_FIXTURE_ID ?? "18257865");
  const session = await createTxlineSession();
  const fixture = await fetchFixtureSnapshot(session, fixtureId);
  const fixtureProof = await fetchFixtureProof(session, fixture);
  const odds = await fetchLatestFullMatchOdds(session, fixtureId);
  const oddsProof = await fetchOddsProof(session, odds.packet);

  const provider = AnchorProvider.env();
  setProvider(provider);
  if (!(await validateFixtureOnDevnet(provider, fixtureProof.proof))) throw new Error("TxLINE validate_fixture returned false");
  if (!(await validateOddsOnDevnet(provider, oddsProof.proof))) throw new Error("TxLINE validate_odds returned false");

  const fixtureName = `txline-${fixtureId}-${fixture.Ts}-fixture-proof.raw.json`;
  const snapshotName = `txline-${fixtureId}-${odds.packet.Ts}-odds-snapshot.raw.json`;
  const oddsName = `txline-${fixtureId}-${odds.packet.Ts}-odds-proof.raw.json`;
  const fixtureHash = await preserveAuthenticArtifact(fixtureName, fixtureProof.bytes);
  const snapshotHash = await preserveAuthenticArtifact(snapshotName, odds.snapshotBytes);
  const oddsHash = await preserveAuthenticArtifact(oddsName, oddsProof.bytes);
  console.log(
    JSON.stringify(
      {
        fixtureId: fixtureId.toString(),
        fixture: `${fixture.Participant1} v ${fixture.Participant2}`,
        packet: { messageId: odds.packet.MessageId, ts: odds.packet.Ts, prices: odds.packet.Prices },
        artifacts: {
          fixtureProof: { file: fixtureName, sha256: fixtureHash },
          oddsSnapshot: { file: snapshotName, sha256: snapshotHash },
          oddsProof: { file: oddsName, sha256: oddsHash },
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
