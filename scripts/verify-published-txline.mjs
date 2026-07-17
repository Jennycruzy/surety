import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import * as local from "@surety-tx/txline-verify";

const exec = promisify(execFile);
const version = "0.1.0";
const proof = JSON.parse(await readFile("data/recordings/phase0-18237038-message-000791-odds-proof.raw.json", "utf8"));
local.assertAuthenticProofShape(proof);
const expected = local.oddsMessageHash(proof.odds.MessageId).toString("hex");
const directory = await mkdtemp(path.join(tmpdir(), "surety-txline-registry-"));
try {
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await exec("npm", ["install", `@surety-tx/txline-verify@${version}`, "--registry=https://registry.npmjs.org", "--ignore-scripts"], { cwd: directory });
  const published = await import(pathToFileURL(path.join(directory, "node_modules/@surety-tx/txline-verify/dist/index.js")).href);
  published.assertAuthenticProofShape(proof);
  const actual = published.oddsMessageHash(proof.odds.MessageId).toString("hex");
  assert.equal(actual, expected, "public registry artifact differs from the in-repo implementation");
  await exec("cargo", ["info", `txline-cpi@${version}`], { cwd: directory });
  console.log(`PASS: public @surety-tx/txline-verify@${version} matched in-repo result ${actual}`);
  console.log(`PASS: public txline-cpi@${version} is installable from crates.io`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
