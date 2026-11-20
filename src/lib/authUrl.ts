export const LOCAL_AUTH_ORIGIN = "http://localhost:8787";
export const PROD_AUTH_ORIGIN = "https://auth.susu.dev";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Returns the authsu origin for the current host: localhost:8787 when running
 * locally (dev, preview, wrangler dev) and https://auth.susu.dev in production.
 */
export function getAuthOrigin(
  hostname: string | undefined = globalThis.location?.hostname,
): string {
  return hostname !== undefined && LOCAL_HOSTS.has(hostname) ? LOCAL_AUTH_ORIGIN : PROD_AUTH_ORIGIN;
}

/** Builds a full authsu URL for an API path such as `/api/session`. */
export function authUrl(path: string, hostname?: string): string {
  return `${getAuthOrigin(hostname)}${path}`;
}
