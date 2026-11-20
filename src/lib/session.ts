/**
 * Who the session cookie speaks for. The cookie is HttpOnly, so script can only ask the
 * server: GET /api/session answers 200 `{userId, role}` or 401.
 *
 * authsu's session answer carries no name. A user's name lives in their profile, which the
 * server exposes at GET /api/user/{id}; that route needs the `user:read` scope.
 */

export type SessionInfo = { userId: string; role: string };

/** GET /api/session. Returns null when signed out or on any failure. Never throws. */
export async function fetchSession(
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<SessionInfo | null> {
  try {
    const response = await fetchFn("/api/session", {
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { userId?: unknown; role?: unknown } | null;
    if (typeof body?.userId !== "string") return null;
    return { userId: body.userId, role: typeof body.role === "string" ? body.role : "member" };
  } catch {
    return null;
  }
}

/**
 * GET /api/user/{id}, reading `profile.name`. Null when the server refuses (a member lacks
 * `user:read` today) or the profile has no name. Never throws.
 */
export async function fetchUserName(
  userId: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<string | null> {
  try {
    const response = await fetchFn(`/api/user/${encodeURIComponent(userId)}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { profile?: { name?: unknown } } | null;
    const name = body?.profile?.name;
    return typeof name === "string" && name !== "" ? name : null;
  } catch {
    return null;
  }
}
