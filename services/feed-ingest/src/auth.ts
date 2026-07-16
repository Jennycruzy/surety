import { readFile } from "node:fs/promises";

type StoredCredentials = { apiToken: string };

export async function loadApiToken(): Promise<string> {
  if (process.env.TXLINE_API_TOKEN) return process.env.TXLINE_API_TOKEN;
  const secretPath = process.env.TXLINE_SECRET_PATH ?? ".secrets/txline-devnet.json";
  const stored = JSON.parse(await readFile(/* turbopackIgnore: true */ secretPath, "utf8")) as StoredCredentials;
  if (!stored.apiToken) throw new Error(`Missing apiToken in ${secretPath}`);
  return stored.apiToken;
}

export async function createGuestJwt(apiOrigin: string): Promise<string> {
  const response = await fetch(`${apiOrigin}/auth/guest/start`, { method: "POST" });
  if (!response.ok) throw new Error(`Guest authentication failed: HTTP ${response.status}`);
  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error("Guest authentication response omitted token");
  return body.token;
}
