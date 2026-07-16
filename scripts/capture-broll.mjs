// Captures wallet-free b-roll of the running app: the glass balance sheet animating through
// the goal, then the settlement demo policy page. Produces data/evidence/*.webm.
//   PORT=3123 npm run start &   # (or npm run dev)
//   node scripts/capture-broll.mjs
import { chromium } from "playwright";
import { rename, mkdir } from "node:fs/promises";

const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3123";
const DEMO_POLICY = process.env.CAPTURE_POLICY ?? "CpCdFcNkHHjQwW7J4AKyuRZNxusRMi8a6kSKjM2pqXGq";
const OUT = "data/evidence";

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(25000); // full replay cycle incl. the goal (records 6->10)

await page.goto(`${BASE}/policy/${DEMO_POLICY}`, { waitUntil: "networkidle" });
await page.waitForTimeout(8000); // total recorded page time is at least 33 seconds

const video = page.video();
await context.close();
await browser.close();
if (video) {
  await rename(await video.path(), `${OUT}/gate6-glass-balance-sheet.webm`);
  console.log("SAVED", `${OUT}/gate6-glass-balance-sheet.webm`);
} else {
  console.log("NO VIDEO");
}
