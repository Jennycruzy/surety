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
SURETY_ODDS_SNAPSHOT_FILE=<filename under data/recordings>
SURETY_REQUIRE_VALIDATED_ODDS=1
```

Do not enable `SURETY_REQUIRE_VALIDATED_ODDS` until that exact packet has passed TxLINE
`validate_odds` and its SURETY `ValidatedOdds` receipt exists on the deployed program. Use
a formula-version 2 vault for the proof-required build; version 2 disables the legacy
issuance instruction at the program level, while the existing version 1 demo vault remains
backward compatible.

Wallet-signed flows (buy coverage, LP deposit/withdraw) work in the deployed app with any
Wallet-Standard wallet (Phantom, Solflare, Backpack) set to **Devnet**. The dashboard and
the settlement payout need no wallet.

## Verifying the deploy

- `/` renders the animated glass balance sheet.
- `/underwrite` shows live vault stats (total capital, open policies, share price).
- `/policy/CpCdFcNkHHjQwW7J4AKyuRZNxusRMi8a6kSKjM2pqXGq` shows the settle panel; clicking
  "Submit TxLINE proof & settle" fires the real atomic TxLINE-CPI payout on devnet.
