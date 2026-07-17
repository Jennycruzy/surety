# Deploying SURETY for judges

The app is a standard Next.js 16 app with server actions that read live devnet state and
sign two devnet-only transactions (the test-USDC faucet and permissionless settlement).
It hosts on any serverless Next platform — **no VPS required**. Vercel steps below.

## What judges can already test without a deploy

- **Program (live on devnet):** `3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW`
- **Showcase vault:** `CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC`
- **Open, settleable demo policy:** `CpCdFcNkHHjQwW7J4AKyuRZNxusRMi8a6kSKjM2pqXGq`
- Run locally: `npm install && npm run dev` → http://localhost:3000

## One required secret

Both the faucet and settlement server actions sign as the **devnet deployer** — the
test-USDC mint authority and a permissionless settle caller. It custodies no user funds and
only ever touches a valueless devnet test token. Provide its key as an env var so the host
needs no repo filesystem:

```
SURETY_DEPLOYER_SECRET = <contents of .secrets/devnet-deployer.json, e.g. [12,34,...]>
```

`app/lib/deployer.ts` reads `SURETY_DEPLOYER_SECRET` first and falls back to the local file
for `npm run dev`.

> Security note: this is a devnet key with no monetary value. Do not reuse this pattern with
> a mainnet key that holds real assets.

## Vercel

1. `npm i -g vercel` and `vercel login` (run this yourself — it needs your account).
2. From the repo root: `vercel` (accept defaults; framework auto-detected as Next.js).
3. In the Vercel project → Settings → Environment Variables, add `SURETY_DEPLOYER_SECRET`
   (the JSON byte array). Optionally set it only for Production/Preview.
4. `vercel --prod` to promote. The build runs `next build`; `next.config.ts` traces only
   the odds-snapshot files, authentic settlement proof, attestation chain, and SURETY IDL
   needed by the server functions.

The default environment preserves the audited France–Spain build. To deploy a separate
live-fixture build after its TxLINE odds receipt is recorded, also set:

```text
NEXT_PUBLIC_SURETY_FIXTURE_ID=<fixture id>
NEXT_PUBLIC_SURETY_FIXTURE_LABEL=<display label>
NEXT_PUBLIC_SURETY_VAULT=<formula-version 2 vault>
NEXT_PUBLIC_SURETY_ASSET_MINT=<that vault's test-token mint>
TXLINE_API_TOKEN=<TxLINE API token>
SURETY_REQUIRE_VALIDATED_ODDS=1
```

Validated mode fetches the latest authenticated snapshot and synchronizes its SURETY
receipt on demand. Use a formula-version 2 vault; version 2 disables legacy issuance,
requires both a fixture receipt and fresh odds receipt, and binds the exposure bucket
on-chain. The existing version 1 demo vault remains backward compatible.

Outcome-button team names come from `NEXT_PUBLIC_SURETY_HOME_TEAM` and
`NEXT_PUBLIC_SURETY_AWAY_TEAM`. Set them per fixture so the labels never contradict the
configured match; when unset they fall back to neutral "Home team" / "Away team" wording.

## Pre-warming receipts (optional keeper)

Correctness never depends on a background process — the quote path already synchronizes
receipts on demand. Pre-warming only reduces first-quote latency by keeping the fixture and
odds receipts current. Two ways to run it:

**A. Persistent loop** (a separate worker, not on Vercel):

```bash
npm run keeper:odds -- --fixture 18257865 --interval 60
```

Runs a tick every 60 seconds, retrying transient TxLINE/RPC failures with backoff. Host it
on any always-on runtime (Fly.io, Railway, Render, or a supervised VPS) with the same
secrets the app uses.

**B. HTTP endpoint + external scheduler** (no worker to host). The app exposes an
authenticated route that runs exactly one tick:

```
GET /api/keeper?fixture=<id>
Authorization: Bearer <KEEPER_TRIGGER_SECRET>
```

Set `KEEPER_TRIGGER_SECRET` in the deploy env (any long random string). The endpoint fails
closed — without a matching bearer token it returns 401. The fixture can also be fixed with
`SURETY_KEEPER_FIXTURE_ID` instead of the query param. Point any scheduler (e.g.
cron-job.org) at the URL with the `Authorization` header on a 1–5 minute interval. A
successful tick returns `{"ok":true, ...}` with the fixture/odds receipt addresses.

> Vercel serverless functions have an execution-time limit (10s on Hobby, 60s on Pro). A
> normal tick is well under that, but under devnet congestion set `SURETY_RPC_ENDPOINT` to a
> dedicated RPC to stay fast and avoid public-endpoint 429s.

The exercised France–England devnet configuration is:

```text
NEXT_PUBLIC_SURETY_FIXTURE_ID=18257865
NEXT_PUBLIC_SURETY_FIXTURE_LABEL=France v England
NEXT_PUBLIC_SURETY_VAULT=9npibs7NyjhgWrG5muCFbLRCDoVxMiWWEfp2yMXhUNyF
NEXT_PUBLIC_SURETY_ASSET_MINT=FiJfrnLoc2vZmjixZqCEBuWd8A5EuDaF9MZZhd96bpck
SURETY_REQUIRE_VALIDATED_ODDS=1
```

Wallet-signed flows (buy coverage, LP deposit/withdraw) work in the deployed app with any
Wallet-Standard wallet (Phantom, Solflare, Backpack) set to **Devnet**. The dashboard and
the settlement payout need no wallet.

## Verifying the deploy

- `/` renders the animated glass balance sheet.
- `/underwrite` shows live vault stats (total capital, open policies, share price).
- `/policy/CpCdFcNkHHjQwW7J4AKyuRZNxusRMi8a6kSKjM2pqXGq` shows the settle panel; clicking
  "Submit TxLINE proof & settle" fires the real atomic TxLINE-CPI payout on devnet.
