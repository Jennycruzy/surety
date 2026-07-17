import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createGuestJwt, loadApiToken } from "../../feed-ingest/src/auth.js";

type ScoreRecord = {
  FixtureId: number;
  Seq: number;
  Action?: string;
  StatusId?: number;
  Stats?: Record<string, number>;
};

type RawV2Proof = {
  ts: number;
  statsToProve: Array<{ key: number; value: number; period: number }>;
  eventStatRoot: number[];
  summary: { fixtureId: number; updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number }; eventStatsSubTreeRoot: number[] };
  statProofs: Array<Array<{ hash: number[]; isRightSibling: boolean }>>;
  subTreeProof: Array<{ hash: number[]; isRightSibling: boolean }>;
  mainTreeProof: Array<{ hash: number[]; isRightSibling: boolean }>;
};

const fixtures = [
  { id: 18_218_149, recording: "data/recordings/phase0-18218149-historical.raw.json" },
  { id: 18_237_038, recording: "data/recordings/worldcup-18237038-20260714-live-scores.raw.sse" },
] as const;
const prefixes = [1_000, 2_000, 3_000] as const;
const bases = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function rowsFromSse(bytes: string): ScoreRecord[] {
  return bytes.split(/\r?\n/).filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)) as ScoreRecord);
}

function phaseSequence(rows: ScoreRecord[], prefix: number): ScoreRecord {
  const halftime = rows.find((row) => row.Action === "halftime_finalised");
  if (!halftime) throw new Error("recording has no halftime_finalised record");
  const candidates = prefix === 1_000
    ? rows.filter((row) => row.StatusId === 2 && row.Seq < halftime.Seq)
    : prefix === 2_000
      ? [halftime]
      : rows.filter((row) => row.StatusId === 4 && row.Seq > halftime.Seq);
  const selected = candidates.at(-1);
  if (!selected) throw new Error(`recording has no phase record for prefix ${prefix}`);
  return selected;
}

function assertProof(proof: RawV2Proof, fixtureId: number, key: number): void {
  if (proof.summary.fixtureId !== fixtureId) throw new Error("proof fixture mismatch");
  if (proof.statsToProve.length !== 1 || proof.statsToProve[0]?.key !== key) throw new Error("proof stat-key mismatch");
  if (proof.statProofs.length !== 1) throw new Error("proof/stat-proof cardinality mismatch");
  for (const bytes of [proof.eventStatRoot, proof.summary.eventStatsSubTreeRoot]) {
    if (bytes.length !== 32 || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error("invalid bytes32 field");
  }
  for (const nodes of [...proof.statProofs, proof.subTreeProof, proof.mainTreeProof]) {
    if (nodes.length > 32 || nodes.some((node) => node.hash.length !== 32)) throw new Error("invalid Merkle path");
  }
}

async function main() {
  const origin = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
  const jwt = await createGuestJwt(origin);
  const apiToken = await loadApiToken();
  const results = [];
  for (const fixture of fixtures) {
    const rows = rowsFromSse(await readFile(fixture.recording, "utf8"));
    for (const prefix of prefixes) {
      const phase = phaseSequence(rows, prefix);
      for (const base of bases) {
        const key = prefix + base;
        const url = new URL("/api/scores/stat-validation", origin);
        url.search = new URLSearchParams({ fixtureId: String(fixture.id), seq: String(phase.Seq), statKeys: String(key) }).toString();
        const response = await fetch(url, { headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken } });
        const bytes = Buffer.from(await response.arrayBuffer());
        let status: "proof-returned" | "rejected" = "rejected";
        let detail = `HTTP ${response.status}: ${bytes.toString("utf8").slice(0, 180)}`;
        let proofSha256: string | null = null;
        let proofTimestamp: number | null = null;
        let value: number | null = null;
        let proofPeriod: number | null = null;
        let proofArtifact: string | null = null;
        if (response.ok) {
          const proof = JSON.parse(bytes.toString("utf8")) as RawV2Proof;
          assertProof(proof, fixture.id, key);
          status = "proof-returned";
          detail = "TxLINE returned a structurally complete Merkle proof for the requested fixture, phase sequence, and stat key";
          proofSha256 = createHash("sha256").update(bytes).digest("hex");
          proofTimestamp = proof.ts;
          value = proof.statsToProve[0]!.value;
          proofPeriod = proof.statsToProve[0]!.period;
          if (prefix === 2_000 && (base === 1 || base === 2)) {
            proofArtifact = `data/recordings/txline-${fixture.id}-seq${phase.Seq}-ht-stat-${key}-proof-v2.raw.json`;
            try {
              const existing = await readFile(proofArtifact);
              if (!existing.equals(bytes)) throw new Error(`${proofArtifact} already exists with different authentic bytes`);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
              await writeFile(proofArtifact, bytes, { flag: "wx", mode: 0o600 });
            }
          }
        }
        results.push({ fixtureId: fixture.id, recording: fixture.recording, seq: phase.Seq, action: phase.Action, statusId: phase.StatusId, prefix, baseKey: base, statKey: key, status, detail, proofSha256, proofArtifact, proofTimestamp, value, proofPeriod });
      }
    }
  }
  const matrix = {
    schema: "surety.txline.provability-matrix.v1",
    generatedAt: new Date().toISOString(),
    apiOrigin: origin,
    candidates: { prefixes, baseKeys: bases },
    results,
    doubtfulItems: [
      { item: "goal timestamps", status: "no-validation-key", failureMode: "Goal time exists only as raw event clock data; no numeric Stats key or documented stat-validation mapping was found." },
      { item: "penalties/shootout decision", status: "no-validation-key", failureMode: "Penalty events exist in the raw events feed; no proof-backed decision-method Stats key is documented or observed." },
    ],
  };
  await writeFile("docs/provability-matrix.json", `${JSON.stringify(matrix, null, 2)}\n`);
  const lines = [
    "# TxLINE period-stat provability matrix", "",
    `Generated ${matrix.generatedAt} from authenticated TxLINE devnet requests against two committed recordings.`, "",
    "A `proof-returned` cell means the API returned a complete, key-matched Merkle payload. On-chain acceptance remains a separate gate and must not be inferred from API success alone.", "",
    "| Fixture | Phase seq | Prefix | Keys returning proofs | Rejections |", "|---:|---:|---:|---|---|",
  ];
  for (const fixture of fixtures) for (const prefix of prefixes) {
    const group = results.filter((row) => row.fixtureId === fixture.id && row.prefix === prefix);
    const ok = group.filter((row) => row.status === "proof-returned").map((row) => row.statKey).join(", ") || "none";
    const rejected = group.filter((row) => row.status === "rejected").map((row) => row.statKey).join(", ") || "none";
    lines.push(`| ${fixture.id} | ${group[0]!.seq} (${group[0]!.action ?? "unknown"}) | ${prefix} | ${ok} | ${rejected} |`);
  }
  const samples = results.filter((row) => row.proofArtifact).map((row) => `- Fixture ${row.fixtureId}, key ${row.statKey}: [proof](../${row.proofArtifact}) · SHA-256 \`${row.proofSha256}\``);
  lines.push("", "## Preserved halftime proof samples", "", ...samples, "", "## Designed refusals", "", ...matrix.doubtfulItems.map((item) => `- **${item.item}:** ${item.failureMode}`), "", "Machine-readable source: [`provability-matrix.json`](./provability-matrix.json).", "");
  await writeFile("docs/PROVABILITY_MATRIX.md", lines.join("\n"));
  console.log(`PASS: wrote ${results.length} authenticated probe results; ${results.filter((row) => row.status === "proof-returned").length} returned proofs`);
}

await main();
