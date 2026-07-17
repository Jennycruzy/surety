import { syncValidatedMarket } from "../../../services/odds-validation/src/sync.js";
import { FIXTURE_ID } from "../../lib/config.js";

// This route runs one keeper tick: fetch the latest TxLINE packet, validate the fixture
// and odds on devnet, and record any missing receipts. It exists so an external HTTP
// scheduler (e.g. cron-job.org) can pre-warm receipts without a persistent worker. It is
// an OPTIONAL latency optimization — the on-demand quote path already syncs receipts.
//
// Node APIs (fs, crypto, the deployer keypair) are required, so force the Node runtime
// and disable caching so every request runs a fresh tick.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protect the endpoint so only your scheduler can trigger receipt transactions. Set
// KEEPER_TRIGGER_SECRET in the deploy env and send it as `Authorization: Bearer <secret>`.
function authorized(request: Request): boolean {
  const secret = process.env.KEEPER_TRIGGER_SECRET;
  if (!secret) return false; // fail closed: no secret configured means no access
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && token === secret;
}

async function tick() {
  const result = await syncValidatedMarket(FIXTURE_ID);
  return Response.json({
    ok: true,
    observedAt: new Date().toISOString(),
    fixtureId: FIXTURE_ID.toString(),
    messageId: result.packet.MessageId,
    oddsTimestampMs: result.packet.Ts,
    fixtureReceipt: result.fixtureAddress.toBase58(),
    oddsReceipt: result.oddsAddress.toBase58(),
    fixtureTransaction: result.fixtureTransaction,
    oddsTransaction: result.oddsTransaction,
  });
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    return await tick();
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

// cron-job.org can issue GET or POST; support both.
export const GET = handle;
export const POST = handle;
