import assert from "node:assert/strict";
import { test } from "node:test";
import { compilePredicate, decodePredicate, PredicateError } from "../../services/predicate/src/compiler.js";

const valid = [
  "outcome(18237038) == WIN_HOME",
  "stat(18237038, goals_total) > 2",
  "stat(18218149,corners_home) >= 5",
  "stat(18218149,red_cards_away) == 0",
  "stat(18237038,goals_home) >= 1 AND stat(18237038,goals_total) <= 4",
];

test("text -> canonical bytes -> text round trips", () => {
  for (const source of valid) {
    const compiled = compilePredicate(source);
    const decoded = decodePredicate(compiled.canonicalBytes);
    assert.equal(decoded.canonicalText, compiled.canonicalText);
    assert.equal(decoded.hash, compiled.hash);
    assert.deepEqual(decoded.canonicalBytes, compiled.canonicalBytes);
  }
});

test("formatting, case, and AND order do not change canonical bytes or hash", () => {
  const left = compilePredicate("STAT(18237038, GOALS_TOTAL)>2 and outcome(18237038)==win_home");
  const right = compilePredicate(" outcome ( 18237038 ) == WIN_HOME AND stat ( 18237038 , goals_total ) > 2 ");
  assert.deepEqual(left.canonicalBytes, right.canonicalBytes);
  assert.equal(left.hash, right.hash);
});

test("illegal and unproven fields are rejected with human-readable reasons", () => {
  assert.throws(() => compilePredicate("stat(1,shots_on_target) > 2"), /illegal stat.*proof-backed/i);
  assert.throws(() => compilePredicate("tournament_result(MAR) == WINNER"), /unsettleable.*stage-tag/i);
  assert.throws(() => compilePredicate("decided_by(1) == PENALTIES"), /unsettleable.*decision-method/i);
  assert.throws(() => compilePredicate("weather(1) == RAIN"), /illegal field/i);
});

test("invalid operators, values, duplicates, and excessive compounds are rejected", () => {
  assert.throws(() => compilePredicate("outcome(1) > WIN_HOME"), /only the == operator/i);
  assert.throws(() => compilePredicate("outcome(1) == HOME_OR_DRAW"), /illegal outcome/i);
  assert.throws(() => compilePredicate("stat(1,goals_home) == 2147483648"), /outside the signed 32-bit/i);
  assert.throws(() => compilePredicate("stat(1,goals_home) > 0 AND stat(1,goals_home) > 0"), /duplicate comparisons/i);
  assert.throws(
    () => compilePredicate("stat(1,goals_home)>0 AND stat(1,goals_away)>0 AND stat(1,corners_total)>2"),
    /at most two/i,
  );
});

test("decoder rejects non-canonical or corrupted encodings", () => {
  const encoded = Buffer.from(compilePredicate("outcome(18237038) == DRAW").canonicalBytes);
  encoded[14] = 1;
  assert.throws(() => decodePredicate(encoded), PredicateError);
  assert.throws(() => decodePredicate(Uint8Array.of(99, 0)), /unsupported.*version/i);
});

test("hash is stable against a pinned protocol vector", () => {
  const compiled = compilePredicate("outcome(18237038) == WIN_HOME");
  assert.equal(Buffer.from(compiled.canonicalBytes).toString("hex"), "0101026e46160100000000000000000000");
  assert.equal(compiled.hash, "e74f3d39032f9c393744a58851631954bcf77a87f404e118d4b89b37700f1fa8");
});
