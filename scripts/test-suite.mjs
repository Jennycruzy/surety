import { spawnSync } from "node:child_process";

const group = process.argv[2] ?? "all";
const groups = {
  grammar: ["tests/phase2/grammar.test.ts"],
  phase1: ["tests/phase1/sse.test.ts"],
  all: [
    "tests/phase1/sse.test.ts",
    "tests/phase2/grammar.test.ts",
    "tests/phase5/odds-validation.test.ts",
    "tests/phase5/quote-engine.test.ts",
    "tests/phase6/marker.test.ts",
  ],
};

if (!(group in groups)) {
  console.error(`FAIL: unknown test group '${group}'`);
  process.exit(2);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...groups[group]], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
