import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAuthenticProofShape, oddsMessageHash } from "@surety-tx/txline-verify";

const path = process.argv[2];
assert(path, "usage: node verify-recorded.mjs <odds-proof.json>");
const proof = JSON.parse(await readFile(path, "utf8"));
assertAuthenticProofShape(proof);
assert.equal(oddsMessageHash(proof.odds.MessageId).length, 32);
console.log(`PASS: verified recorded proof shape for ${proof.odds.MessageId}`);
