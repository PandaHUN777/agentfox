/**
 * API client.
 *
 * The dashboard is a client of the same public API the CLI and SDK use (principle
 * X-5) — no privileged back-channel, no database access from this process. That
 * constraint is what keeps the API honest: anything the UI can show, a script can
 * fetch.
 */

const BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

// In MVP self-host there is no IdP wired (PRD §6.3); the control plane accepts a
// development identity header when NOMETRIA_ENVIRONMENT is a dev environment, or a
// bearer token everywhere else (auth_mode=token). Both paths are supported here
// because the value of a demo of a governance product is undercut by the demo itself
// running with authentication turned off — a live deployment sets NOMETRIA_API_TOKEN
// and gets the real path; local dev with no token set keeps working exactly as before.
// Swap for a session cookie or OIDC token when the SSO seam in P2-4 is connected.
const USER = process.env.NOMETRIA_USER || "admin@example.com";
const TOKEN = process.env.NOMETRIA_API_TOKEN;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN
        ? { Authorization: `Bearer ${TOKEN}` }
        : { "X-Nometria-User": USER }),
      ...(init?.headers || {}),
    },
    // Governance data is live data; a cached control status is a wrong control status.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(body.slice(0, 400) || res.statusText, res.status, path);
  }
  return res.json() as Promise<T>;
}

/** Fetch that renders an inline error rather than blanking the page. */
export async function safeApi<T = any>(path: string, fallback: T): Promise<T> {
  try {
    return await api<T>(path);
  } catch {
    return fallback;
  }
}

export const post = <T = any>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
