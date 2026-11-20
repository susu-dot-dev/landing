import { afterEach, describe, expect, rs, test } from "@rstest/core";
import {
  classifyAssertionError,
  classifyLoginError,
  type LoginCredentialsApi,
  login,
  logout,
} from "./login";

const json = (status: number, body?: unknown) => new Response(JSON.stringify(body), { status });
const statics = { parseRequestOptionsFromJSON: (o: unknown) => o as never };
const credential = {
  type: "public-key",
  toJSON: () => ({ id: "cred", type: "public-key" }),
} as unknown as Credential;
const credentials = (result: Credential | null | Error = credential): LoginCredentialsApi => ({
  get: async () => {
    if (result instanceof Error) throw result;
    return result;
  },
});

type Call = { url: string; init?: RequestInit };
const fetcher = (replies: Array<Response | "network">) => {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (reply === "network" || reply === undefined) throw new TypeError("offline");
    return reply;
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
};

describe("classifiers", () => {
  test("login errors", () => {
    expect(classifyLoginError(401, "invalid_login")).toBe("invalid_login");
    expect(classifyLoginError(503, "login_not_configured")).toBe("unavailable");
    expect(classifyLoginError(400, "other")).toBe("unknown");
    expect(classifyLoginError(400, undefined)).toBe("unknown");
  });

  test("assertion errors", () => {
    expect(classifyAssertionError({ name: "NotAllowedError" })).toBe("cancelled");
    expect(classifyAssertionError({ name: "AbortError" })).toBe("cancelled");
    expect(classifyAssertionError({ name: "SecurityError" })).toBe("authenticator_failed");
    expect(classifyAssertionError(null)).toBe("authenticator_failed");
  });
});

describe("login", () => {
  test("begin, get, finish, with cookies included and the credential posted as-is", async () => {
    const { calls, fetchFn } = fetcher([
      json(200, { publicKey: { challenge: "c" } }),
      json(200, { userId: "u", role: "member", expiresAt: 1 }),
    ]);
    const result = await login({ fetchFn, credentials: credentials(), statics });
    expect(result).toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual(["/api/login/begin", "/api/login/finish"]);
    expect(calls[0]?.init?.body).toBeUndefined();
    expect(calls[1]?.init?.body).toBe(JSON.stringify({ id: "cred", type: "public-key" }));
    expect(calls.every((c) => c.init?.credentials === "include")).toBe(true);
  });

  test("unsupported when WebAuthn pieces are missing", async () => {
    const { fetchFn } = fetcher([]);
    const none = { ok: false, code: "unsupported" };
    expect(await login({ fetchFn, credentials: credentials(), statics: {} as never })).toEqual(
      none,
    );
    expect(await login({ fetchFn, credentials: {} as never, statics })).toEqual(none);
    expect(await login({ fetchFn, statics })).toEqual(none); // no navigator.credentials in happy-dom
  });

  test("uses the global fetch, navigator and PublicKeyCredential by default", async () => {
    // happy-dom has no WebAuthn, so the defaults resolve to unsupported.
    expect(await login()).toEqual({ ok: false, code: "unsupported" });
  });

  test("begin failures", async () => {
    const deps = { credentials: credentials(), statics };
    expect(await login({ ...deps, fetchFn: fetcher(["network"]).fetchFn })).toEqual({
      ok: false,
      code: "network",
    });
    expect(
      await login({ ...deps, fetchFn: fetcher([json(503, { error: { code: "x" } })]).fetchFn }),
    ).toEqual({ ok: false, code: "unavailable" });
    expect(await login({ ...deps, fetchFn: fetcher([json(200, {})]).fetchFn })).toEqual({
      ok: false,
      code: "unknown",
    });
    expect(
      await login({
        ...deps,
        fetchFn: fetcher([new Response("not json", { status: 200 })]).fetchFn,
      }),
    ).toEqual({ ok: false, code: "unknown" });
  });

  test("a dismissed or failing authenticator", async () => {
    const begin = () => json(200, { publicKey: { challenge: "c" } });
    const run = (result: Credential | null | Error) =>
      login({ fetchFn: fetcher([begin()]).fetchFn, credentials: credentials(result), statics });
    expect(await run(Object.assign(new Error("x"), { name: "NotAllowedError" }))).toEqual({
      ok: false,
      code: "cancelled",
    });
    expect(await run(null)).toEqual({ ok: false, code: "authenticator_failed" });
    expect(await run({ type: "password" } as unknown as Credential)).toEqual({
      ok: false,
      code: "authenticator_failed",
    });
  });

  test("finish failures", async () => {
    const run = (reply: Response | "network") =>
      login({
        fetchFn: fetcher([json(200, { publicKey: { challenge: "c" } }), reply]).fetchFn,
        credentials: credentials(),
        statics,
      });
    expect(await run(json(401, { error: { code: "invalid_login" } }))).toEqual({
      ok: false,
      code: "invalid_login",
    });
    expect(await run("network")).toEqual({ ok: false, code: "network" });
  });
});

describe("logout", () => {
  test("succeeds on 204 and posts with credentials", async () => {
    const { calls, fetchFn } = fetcher([new Response(null, { status: 204 })]);
    expect(await logout(fetchFn)).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("/api/logout");
    expect(calls[0]?.init?.credentials).toBe("include");
  });

  test("treats 401 as already logged out", async () => {
    expect(
      await logout(fetcher([json(401, { error: { code: "unauthenticated" } })]).fetchFn),
    ).toEqual({
      ok: true,
    });
  });

  test("reports other failures", async () => {
    expect(await logout(fetcher([json(503)]).fetchFn)).toEqual({ ok: false, code: "unavailable" });
    expect(await logout(fetcher(["network"]).fetchFn)).toEqual({ ok: false, code: "network" });
  });

  test("uses the global fetch by default", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    try {
      expect(await logout()).toEqual({ ok: true });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("login with the browser globals", () => {
  afterEach(() => {
    rs.unstubAllGlobals();
  });

  test("uses global fetch, navigator.credentials and PublicKeyCredential", async () => {
    const urls: string[] = [];
    rs.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return url.endsWith("begin") ? json(200, { publicKey: {} }) : json(200, {});
    });
    rs.stubGlobal("navigator", { credentials: credentials() });
    rs.stubGlobal("PublicKeyCredential", statics);
    expect(await login()).toEqual({ ok: true });
    expect(urls).toEqual(["/api/login/begin", "/api/login/finish"]);
  });

  test("logout uses global fetch", async () => {
    rs.stubGlobal("fetch", async () => json(200, {}));
    expect(await logout()).toEqual({ ok: true });
  });

  test("is unsupported without WebAuthn globals", async () => {
    rs.stubGlobal("navigator", undefined);
    expect(await login()).toEqual({ ok: false, code: "unsupported" });
  });
});
