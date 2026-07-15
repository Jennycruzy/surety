import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChain, verifyChain, type MarkerInput } from "../../services/marker/src/marker.js";

const input: MarkerInput = {
  vault: "vault-1",
  reserves: "1000000000",
  lockedCollateral: "150000000",
  policies: [
    { id: "p1", coverage: "100000000", bucket: "winner" },
    { id: "p2", coverage: "50000000", bucket: "winner" },
  ],
  updates: [
    { packetRef: "pkt-1", packetHash: "11".repeat(32), probabilityPpmByBucket: { winner: 400000 }, timestampMs: "1" },
    { packetRef: "pkt-2", packetHash: "22".repeat(32), probabilityPpmByBucket: { winner: 700000 }, timestampMs: "2" },
  ],
};

test("glass balance sheet chain is fixed-point, deterministic, and tamper evident", () => {
  const first = buildChain(input);
  const second = buildChain(input);
  assert.deepEqual(first, second);
  assert.equal(first[0]!.markedLiabilities, "60000000");
  assert.equal(first[1]!.markedLiabilities, "105000000");
  assert.equal(verifyChain(first), true);
  first[1]!.markedLiabilities = "105000001";
  assert.equal(verifyChain(first), false);
});

test("policy ordering cannot change the book hash or chain", () => {
  assert.deepEqual(buildChain(input), buildChain({ ...input, policies: [...input.policies].reverse() }));
});
