import { readFileSync } from "node:fs";
import path from "node:path";
import Dashboard, { type DashboardRecord } from "../dashboard.js";

export default function Page() {
  const records = readFileSync(path.join(process.cwd(), "data/attestations-gate6.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DashboardRecord)
    .filter((record) => record.seq >= 6);
  return <Dashboard records={records} />;
}
