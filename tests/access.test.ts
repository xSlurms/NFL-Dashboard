import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAccessKey, getAccessKey, isAccessDenied, setAccessKey, subscribeAccess } from "../src/client/accessKey.ts";
import { ApiFetchError, getApi } from "../src/client/api.ts";
import { accessPolicyFromEnv, guard, keyMatches } from "../src/server/api/access.ts";

const KEY = "test-key-0123456789abcdef";
const ok = async () => new Response("ok");
const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/scoreboard", { headers });

describe("accessPolicyFromEnv", () => {
  it("requires the key when ACCESS_KEY is set", () => {
    expect(accessPolicyFromEnv({ ACCESS_KEY: ` ${KEY} ` })).toEqual({ mode: "key", key: KEY });
  });

  it("is open only under netlify dev when no key is set", () => {
    expect(accessPolicyFromEnv({ NETLIFY_DEV: "true" })).toEqual({ mode: "open" });
    expect(accessPolicyFromEnv({}).mode).toBe("misconfigured");
    expect(accessPolicyFromEnv({ NETLIFY_DEV: "false" }).mode).toBe("misconfigured");
  });

  it("rejects a short key, even locally", () => {
    expect(accessPolicyFromEnv({ ACCESS_KEY: "short", NETLIFY_DEV: "true" }).mode).toBe("misconfigured");
  });
});

describe("guard", () => {
  const policy = { mode: "key" as const, key: KEY };

  it("lets the right key through", async () => {
    expect(await (await guard(req({ "X-Access-Key": KEY }), policy, ok)).text()).toBe("ok");
    expect((await guard(req({ "x-access-key": KEY }), policy, ok)).status).toBe(200); // header names are case-insensitive
  });

  it.each([
    ["no key", {}],
    ["a wrong key", { "X-Access-Key": "nope" }],
    ["the key with extra text", { "X-Access-Key": `${KEY}x` }],
    ["the key in another header", { Authorization: KEY }],
  ])("refuses %s with 401 and doesn't run the handler", async (_, headers) => {
    const handler = vi.fn(ok);
    const res = await guard(req(headers), policy, handler);
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "This site needs its access key." } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("fails closed when the server has no key", async () => {
    const handler = vi.fn(ok);
    const res = await guard(req({ "X-Access-Key": KEY }), accessPolicyFromEnv({}), handler);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("config");
    expect(handler).not.toHaveBeenCalled();
  });

  it("is open under netlify dev without a key", async () => {
    expect((await guard(req(), { mode: "open" }, ok)).status).toBe(200);
  });

  it("compares keys exactly", () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    expect(keyMatches(null, KEY)).toBe(false);
    expect(keyMatches("", KEY)).toBe(false);
    expect(keyMatches(KEY.toUpperCase(), KEY)).toBe(false);
  });
});

describe("browser side of the gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAccessKey();
  });

  it("sends the stored key with every request", async () => {
    const seen: Headers[] = [];
    vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return new Response("{}");
    });
    await getApi("/api/scoreboard");
    expect(seen[0].has("X-Access-Key")).toBe(false);
    setAccessKey(KEY);
    expect(getAccessKey()).toBe(KEY);
    await getApi("/api/scoreboard");
    expect(seen[1].get("X-Access-Key")).toBe(KEY);
  });

  it("asks for the key when the server says 401, once until a new key is entered", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code: "unauthorized", message: "no" } }), { status: 401 }));
    const listener = vi.fn();
    const unsubscribe = subscribeAccess(listener);
    await expect(getApi("/api/fantasy")).rejects.toBeInstanceOf(ApiFetchError);
    await expect(getApi("/api/plays")).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(isAccessDenied()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setAccessKey(KEY);
    expect(isAccessDenied()).toBe(false);
    unsubscribe();
  });

  it("doesn't treat other errors as a missing key", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code: "espn_auth", message: "cookies" } }), { status: 502 }));
    await expect(getApi("/api/fantasy")).rejects.toMatchObject({ code: "espn_auth" });
    expect(isAccessDenied()).toBe(false);
  });
});
