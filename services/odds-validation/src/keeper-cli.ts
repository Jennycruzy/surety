import { syncValidatedMarket } from "./sync.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function tick(fixtureId: bigint) {
  const result = await syncValidatedMarket(fixtureId, { preserve: process.argv.includes("--preserve") });
  console.log(
    JSON.stringify({
      observedAt: new Date().toISOString(),
      fixtureId: fixtureId.toString(),
      messageId: result.packet.MessageId,
      oddsTimestampMs: result.packet.Ts,
      prices: result.packet.Prices,
      fixtureReceipt: result.fixtureAddress.toBase58(),
      oddsReceipt: result.oddsAddress.toBase58(),
      fixtureTransaction: result.fixtureTransaction,
      oddsTransaction: result.oddsTransaction,
    }),
  );
}

async function main() {
  const fixtureId = BigInt(argument("--fixture") ?? process.env.NEXT_PUBLIC_SURETY_FIXTURE_ID ?? "18257865");
  const once = process.argv.includes("--once");
  const intervalSeconds = Number(argument("--interval") ?? "60");
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 15) throw new Error("--interval must be at least 15 seconds");
  do {
    const started = Date.now();
    await tick(fixtureId);
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, intervalSeconds * 1_000 - (Date.now() - started))));
  } while (true);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
