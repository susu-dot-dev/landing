import { afterEach, expect, rs, test } from "@rstest/core";
import { authUrl } from "./authUrl";
import { fetchSession, fetchUserName } from "./session";

const json = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("fetchSession returns the user, defaulting a missing role to member", async () => {
  expect(await fetchSession(json({ userId: "u1", role: "admin" }))).toEqual({
    userId: "u1",
    role: "admin",
  });
  expect(await fetchSession(json({ userId: "u1" }))).toEqual({ userId: "u1", role: "member" });
});

test("fetchSession is null when signed out, malformed, or the network fails", async () => {
  expect(await fetchSession(json({ error: { code: "unauthenticated" } }, 401))).toBeNull();
  expect(await fetchSession(json({ role: "admin" }))).toBeNull();
  expect(await fetchSession(json(null))).toBeNull();
  expect(
    await fetchSession((async () => Promise.reject(new Error("down"))) as typeof fetch),
  ).toBeNull();
});

test("fetchUserName reads profile.name and escapes the id", async () => {
  let url = "";
  const fetchFn = (async (input: RequestInfo | URL) => {
    url = String(input);
    return new Response(JSON.stringify({ profile: { name: "Ada" } }));
  }) as typeof fetch;
  expect(await fetchUserName("a/b", fetchFn)).toBe("Ada");
  expect(url).toBe(authUrl("/api/user/a%2Fb"));
});

test("fetchUserName is null when refused, nameless, or failing", async () => {
  expect(await fetchUserName("u", json({}, 403))).toBeNull();
  expect(await fetchUserName("u", json({ profile: {} }))).toBeNull();
  expect(await fetchUserName("u", json({ profile: { name: "" } }))).toBeNull();
  expect(await fetchUserName("u", json(null))).toBeNull();
  expect(
    await fetchUserName("u", (async () => Promise.reject(new Error("x"))) as typeof fetch),
  ).toBeNull();
});

afterEach(() => {
  rs.unstubAllGlobals();
});

test("both calls default to global fetch with credentials", async () => {
  const inits: RequestInit[] = [];
  rs.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    inits.push(init);
    return new Response(JSON.stringify({ userId: "u", profile: { name: "Ada" } }));
  });
  expect(await fetchSession()).toEqual({ userId: "u", role: "member" });
  expect(await fetchUserName("u")).toBe("Ada");
  expect(inits.map((i) => i.credentials)).toEqual(["include", "include"]);
});
