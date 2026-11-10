// The access gate: every function call must carry the shared key, so strangers who find the URL can't
// make the site call ESPN on our behalf. Fails closed: a deployed site with no key configured refuses everything.
import { createHash, timingSafeEqual } from "node:crypto";
import type { ApiError } from "../../shared/types.ts";

export const ACCESS_HEADER = "X-Access-Key";
const MIN_KEY_LENGTH = 16;

export type AccessPolicy = { mode: "key"; key: string } | { mode: "open" } | { mode: "misconfigured"; reason: string };

/**
 * ACCESS_KEY set: required. Not set: open only under `netlify dev` (NETLIFY_DEV=true), so local
 * development needs no key; anywhere else the functions refuse to run.
 */
export function accessPolicyFromEnv(env: Record<string, string | undefined>): AccessPolicy {
  const key = env.ACCESS_KEY?.trim();
  if (key) {
    return key.length >= MIN_KEY_LENGTH
      ? { mode: "key", key }
      : { mode: "misconfigured", reason: `ACCESS_KEY must be at least ${MIN_KEY_LENGTH} characters` };
  }
  if (env.NETLIFY_DEV === "true") return { mode: "open" };
  return { mode: "misconfigured", reason: "ACCESS_KEY is not set on the server" };
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compares hashes so the check takes the same time however much of the key matches. */
export function keyMatches(given: string | null, expected: string): boolean {
  return given !== null && timingSafeEqual(digest(given), digest(expected));
}

/** Runs `handler` only if the request carries the right key. */
export async function guard(req: Request, policy: AccessPolicy, handler: () => Promise<Response>): Promise<Response> {
  if (policy.mode === "misconfigured") return deny(500, "config", policy.reason);
  if (policy.mode === "key" && !keyMatches(req.headers.get(ACCESS_HEADER), policy.key)) {
    return deny(401, "unauthorized", "This site needs its access key.");
  }
  return handler();
}

function deny(status: number, code: ApiError["error"]["code"], message: string): Response {
  const body: ApiError = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
