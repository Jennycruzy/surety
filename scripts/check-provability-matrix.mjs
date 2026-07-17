import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PERIOD_PREDICATE_MENU } from "../services/predicate/src/compiler.ts";

const matrix = JSON.parse(await readFile("docs/provability-matrix.json", "utf8"));
assert.equal(matrix.schema, "surety.txline.provability-matrix.v1");
const expected = matrix.candidates.prefixes.length * matrix.candidates.baseKeys.length * 2;
assert.equal(matrix.results.length, expected, "matrix is missing a fixture/prefix/base-key probe");
for (const prefix of matrix.candidates.prefixes) for (const baseKey of matrix.candidates.baseKeys) {
  const rows = matrix.results.filter((row) => row.prefix === prefix && row.baseKey === baseKey);
  assert.equal(new Set(rows.map((row) => row.fixtureId)).size, 2, `matrix lacks two fixtures for ${prefix + baseKey}`);
}
for (const item of PERIOD_PREDICATE_MENU) {
  const rows = matrix.results.filter((row) => row.prefix === item.prefix && row.baseKey === item.baseKey);
  assert(rows.length === 2 && rows.every((row) => row.status === "proof-returned"), `grammar menu contains stale ${item.period}/${item.stat}`);
}
console.log(`PASS: grammar menu matches ${matrix.results.length} committed provability probes`);
