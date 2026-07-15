import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChain, verifyChain } from "../../services/marker/src/marker.js";

test("glass balance sheet chain is deterministic and tamper evident", () => {
  const policies = [{ id: "p1", coverage: 100, bucket: "winner" }, { id: "p2", coverage: 50, bucket: "winner" }];
  const updates = [{ packetRef: "pkt-1", probability: 0.4, ts: 1 }, { packetRef: "pkt-2", probability: 0.7, ts: 2 }];
  const a = buildChain(policies, updates, 1_000); const b = buildChain(policies, updates, 1_000);
  assert.deepEqual(a, b); assert.equal(verifyChain(a), true);
  a[1]!.markedLiabilities += 1; assert.equal(verifyChain(a), false);
});
