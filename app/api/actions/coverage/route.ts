import { PublicKey } from "@solana/web3.js";
import { FIXTURE_ID, FIXTURE_LABEL } from "../../../lib/config.js";
import { requestQuote } from "../../../lib/quote-action.js";
import { buildIssuePolicyTx, buildIssuePolicyWithValidatedOddsTx, newConnection } from "../../../lib/surety-client.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding",
};
type Outcome = "WIN_HOME" | "DRAW" | "WIN_AWAY";

function query(request: Request) {
  const params = new URL(request.url).searchParams;
  const outcome = params.get("outcome") ?? "WIN_HOME";
  if (!(["WIN_HOME", "DRAW", "WIN_AWAY"] as string[]).includes(outcome)) throw new Error("outcome must be WIN_HOME, DRAW, or WIN_AWAY");
  const coverage = params.get("coverage") ?? "100";
  if (!/^\d+(?:\.\d{1,6})?$/.test(coverage) || Number(coverage) <= 0) throw new Error("coverage must be a positive token amount");
  const brokerRaw = params.get("broker");
  const broker = brokerRaw ? new PublicKey(brokerRaw) : undefined;
  return { outcome: outcome as Outcome, coverage, broker };
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export async function GET(request: Request) {
  try {
    const { outcome, coverage, broker } = query(request);
    const quote = await requestQuote({ outcome, coverage });
    const premium = quote.premium ? (Number(quote.premium) / 1_000_000).toFixed(2) : "unavailable";
    return json({
      type: "action",
      icon: new URL("/surety-action.svg", request.url).toString(),
      title: `SURETY coverage · ${FIXTURE_LABEL}`,
      description: `Bind ${coverage} tUSDC of fully collateralized coverage for a quoted ${premium} tUSDC premium. Settlement is verified against TxLINE on-chain.${broker ? " Broker commission is paid atomically from premium." : ""}`,
      label: quote.verdict === "REJECT" ? "Coverage bucket full" : "Bind coverage",
      disabled: quote.verdict === "REJECT",
      links: {
        actions: [
          { label: "Home win coverage", href: `/api/actions/coverage?outcome=WIN_HOME&coverage={coverage}${broker ? `&broker=${broker}` : ""}`, parameters: [{ name: "coverage", label: "Coverage amount (tUSDC)", required: true }] },
          { label: "Draw coverage", href: `/api/actions/coverage?outcome=DRAW&coverage={coverage}${broker ? `&broker=${broker}` : ""}`, parameters: [{ name: "coverage", label: "Coverage amount (tUSDC)", required: true }] },
          { label: "Away win coverage", href: `/api/actions/coverage?outcome=WIN_AWAY&coverage={coverage}${broker ? `&broker=${broker}` : ""}`, parameters: [{ name: "coverage", label: "Coverage amount (tUSDC)", required: true }] },
        ],
      },
    });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : "quote failed" }, 400);
  }
}

export async function POST(request: Request) {
  try {
    const { outcome, coverage, broker } = query(request);
    const body = await request.json() as { account?: string };
    if (!body.account) return json({ message: "account is required" }, 400);
    const holder = new PublicKey(body.account);
    if (broker?.equals(holder)) return json({ message: "self-referral is not allowed" }, 400);
    const quote = await requestQuote({ outcome, coverage });
    if (!quote.premium || quote.verdict === "REJECT") return json({ message: "coverage is not currently bindable" }, 409);
    const nonce = BigInt(Date.now());
    const input = {
      holder,
      payoutAuthority: holder,
      broker,
      nonce,
      predicateBytes: Buffer.from(quote.predicateBytesHex, "hex"),
      predicateLen: quote.predicateLen,
      predicateHash: Buffer.from(quote.predicateHash, "hex"),
      quoteHash: Buffer.from(quote.quoteHash, "hex"),
      bucketHash: Buffer.from(quote.bucketHash, "hex"),
      coverage: BigInt(quote.coverage),
      premium: BigInt(quote.premium),
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60),
    };
    const connection = newConnection();
    const transaction = quote.validatedOddsMessageKeyHex
      ? await buildIssuePolicyWithValidatedOddsTx(connection, { ...input, fixtureId: FIXTURE_ID, validatedOddsMessageKey: Buffer.from(quote.validatedOddsMessageKeyHex, "hex") })
      : await buildIssuePolicyTx(connection, input);
    transaction.feePayer = holder;
    transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
    return json({ transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), message: broker ? "Bind coverage and pay broker commission atomically" : "Bind fully collateralized SURETY coverage" });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : "transaction build failed" }, 400);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
