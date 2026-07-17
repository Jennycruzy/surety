# `@surety-tx/txline-verify`

Verify your first TxLINE packet in five minutes.

```sh
npm install @surety-tx/txline-verify @anchor-lang/core @solana/web3.js
```

```ts
import { readFile } from "node:fs/promises";
import { assertAuthenticProofShape, type RawOddsValidation } from "@surety-tx/txline-verify";

const proof = JSON.parse(
  await readFile("txline-odds-proof.json", "utf8"),
) as RawOddsValidation;

assertAuthenticProofShape(proof);
console.log(proof.odds.MessageId, "has a valid, bounded proof payload");
```

Use `validateOddsOnDevnet` or `validateFixtureOnDevnet` with an Anchor provider to
ask TxLINE's deployed validator to cryptographically verify the proof. `recordStream`
preserves authenticated SSE bytes exactly; `replay` publishes those same frames through
`PacketBus` deterministically. The package deliberately contains no SURETY pricing,
predicate, marking, or insurance logic.

Run `node examples/verify-recorded.mjs path/to/proof.json` for a complete example.

Extracted from SURETY during the TxODDS World Cup Hackathon and released under MIT.
